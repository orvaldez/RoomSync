import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ApiError,
  api,
  isUnauthenticated,
  type Chore,
  type ChoreInput,
  type Household,
  type Member,
} from "../lib/api";
import { todayAsCalendarDate } from "../lib/money";
import { dueLabel } from "../lib/chores";
import { useAuth } from "../auth/useAuth";
import { Field } from "../components/Field";

/**
 * UC-09 — create, assign and complete household chores.
 *
 * Outstanding and completed chores are separate lists rather than one list
 * styled two ways, because "what still needs doing" is the question the page
 * exists to answer. Each chore is a card, not a table row, so it reads in one
 * column at 375px (NFR-05).
 */

type LoadState =
  | { status: "loading" }
  | { status: "ready"; household: Household; members: Member[]; chores: Chore[] }
  | { status: "no-household" }
  | { status: "error" };

export function ChoresPage() {
  const { user, refresh } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const { household } = await api.currentHousehold();
        if (cancelled) return;
        if (!household) {
          setState({ status: "no-household" });
          return;
        }

        const [{ members }, { chores }] = await Promise.all([
          api.members(household.id),
          api.chores(household.id),
        ]);
        if (cancelled) return;
        setState({ status: "ready", household, members, chores });
      } catch (error) {
        if (cancelled) return;
        if (isUnauthenticated(error)) {
          void refresh();
          return;
        }
        setState({ status: "error" });
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  /** Swap in the server's latest copy of one chore, or add it if new. */
  const upsertChore = useCallback((chore: Chore) => {
    setState((current) => {
      if (current.status !== "ready") return current;
      const others = current.chores.filter((c) => c.id !== chore.id);
      return { ...current, chores: [...others, chore] };
    });
  }, []);

  if (state.status === "loading") {
    return (
      <main className="page" aria-busy="true">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (state.status === "no-household") {
    return <Navigate to="/" replace />;
  }

  if (state.status === "error") {
    return (
      <main className="page">
        <h1>Something went wrong</h1>
        <p className="muted">We could not load your chores.</p>
        <p className="join-actions">
          <Link to="/">Back to the dashboard</Link>
        </p>
      </main>
    );
  }

  const today = todayAsCalendarDate();
  const outstanding = sortOutstanding(state.chores.filter((c) => !c.isComplete));
  const completed = sortCompleted(state.chores.filter((c) => c.isComplete));

  return (
    <main className="page">
      <h1>Chores</h1>
      <p className="muted">
        {state.household.name} · <Link to="/">Back to the dashboard</Link>
      </p>

      <AddChoreForm
        household={state.household}
        members={state.members}
        currentUserId={user?.id ?? null}
        onCreated={upsertChore}
      />

      <section className="chore-section" aria-labelledby="outstanding-heading">
        <h2 id="outstanding-heading">Outstanding ({outstanding.length})</h2>
        {outstanding.length === 0 ? (
          <p className="muted">Nothing outstanding. Add a chore above.</p>
        ) : (
          <ul className="chore-list">
            {outstanding.map((chore) => (
              <OutstandingChore
                key={chore.id}
                chore={chore}
                householdId={state.household.id}
                currentUserId={user?.id ?? null}
                today={today}
                onCompleted={upsertChore}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="chore-section" aria-labelledby="completed-heading">
        <h2 id="completed-heading">Completed ({completed.length})</h2>
        {completed.length === 0 ? (
          <p className="muted">No chores completed yet.</p>
        ) : (
          <ul className="chore-list">
            {completed.map((chore) => (
              <li key={chore.id} className="chore chore-done">
                <p className="chore-title">
                  <span aria-hidden="true">✓ </span>
                  {chore.title}
                </p>
                <p className="muted">
                  Completed{" "}
                  {chore.completedAt &&
                    new Date(chore.completedAt).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  {chore.assignee && ` · ${chore.assignee.name}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/** Soonest due first, undated last — the contract's order for open chores. */
function sortOutstanding(chores: Chore[]): Chore[] {
  return [...chores].sort((a, b) => {
    if (a.dueDate === b.dueDate) return a.createdAt.localeCompare(b.createdAt);
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

/** Most recently completed first. */
function sortCompleted(chores: Chore[]): Chore[] {
  return [...chores].sort((a, b) =>
    (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
  );
}

function OutstandingChore({
  chore,
  householdId,
  currentUserId,
  today,
  onCompleted,
}: {
  chore: Chore;
  householdId: string;
  currentUserId: string | null;
  today: string;
  onCompleted: (chore: Chore) => void;
}) {
  const { refresh } = useAuth();
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const due = dueLabel(chore.dueDate, today);

  // FR-15: only the assignee may complete it; anyone may if it is unassigned.
  // The server enforces this regardless (403 CHORE_NOT_ASSIGNED_TO_YOU).
  const canComplete = !chore.assignee || chore.assignee.userId === currentUserId;

  async function complete() {
    setCompleting(true);
    setError(null);

    try {
      const { chore: updated } = await api.completeChore(householdId, chore.id);
      onCompleted(updated);
    } catch (err) {
      if (isUnauthenticated(err)) {
        void refresh();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not complete the chore.");
      setCompleting(false);
    }
  }

  return (
    <li className="chore">
      <p className="chore-title">{chore.title}</p>
      {chore.description && <p className="muted">{chore.description}</p>}
      <p className="muted">
        {chore.assignee
          ? chore.assignee.userId === currentUserId
            ? "Assigned to you"
            : `Assigned to ${chore.assignee.name}`
          : "Unassigned"}
        {" · "}
        <span className={due.overdue ? "overdue" : undefined}>
          {due.overdue && <span aria-hidden="true">⚠ </span>}
          {due.text}
        </span>
      </p>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {canComplete ? (
        <button type="button" onClick={() => void complete()} disabled={completing}>
          {completing ? "Marking complete…" : "Mark complete"}
        </button>
      ) : (
        <p className="muted">Only {chore.assignee?.name} can mark this complete.</p>
      )}
    </li>
  );
}

function AddChoreForm({
  household,
  members,
  currentUserId,
  onCreated,
}: {
  household: Household;
  members: Member[];
  currentUserId: string | null;
  onCreated: (chore: Chore) => void;
}) {
  const { refresh } = useAuth();
  const assigneeId = useId();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaved(null);

    if (title.trim() === "") {
      setFieldErrors({ title: "Title is required." });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    const input: ChoreInput = { title: title.trim() };
    if (description.trim()) input.description = description.trim();
    if (assignedUserId) input.assignedUserId = assignedUserId;
    if (dueDate) input.dueDate = dueDate;

    try {
      const { chore } = await api.createChore(household.id, input);
      onCreated(chore);
      setSaved(`Added “${chore.title}”.`);
      setTitle("");
      setDescription("");
      setAssignedUserId("");
      setDueDate("");
    } catch (error) {
      if (isUnauthenticated(error)) {
        void refresh();
        return;
      }
      if (error instanceof ApiError && error.code === "VALIDATION_FAILED") {
        setFieldErrors(error.fields);
      } else {
        setFormError(
          error instanceof ApiError ? error.message : "Something went wrong. Please try again."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="add-chore-heading">
      <h2 id="add-chore-heading">Add a chore</h2>

      <form className="auth-form chore-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <Field
          label="Title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={fieldErrors.title}
          placeholder="e.g. Take out bins"
          maxLength={100}
          required
        />

        <Field
          label="Description (optional)"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={fieldErrors.description}
          maxLength={500}
        />

        <div className="field">
          <label htmlFor={assigneeId}>Assign to</label>
          <select
            id={assigneeId}
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
          >
            <option value="">Unassigned — anyone can complete it</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.userId === currentUserId ? `${member.name} (you)` : member.name}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Due date (optional)"
          name="dueDate"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          error={fieldErrors.dueDate}
        />

        <button type="submit" disabled={submitting}>
          {submitting ? "Adding…" : "Add chore"}
        </button>

        <p className="muted" role="status">
          {saved ?? ""}
        </p>
      </form>
    </section>
  );
}
