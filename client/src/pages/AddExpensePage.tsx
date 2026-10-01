import { useEffect, useId, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ApiError,
  api,
  isUnauthenticated,
  type ExpenseInput,
  type Household,
  type Member,
  type Share,
  type SplitMethod,
} from "../lib/api";
import {
  formatBasisPoints,
  formatCents,
  parseDollarsToCents,
  parsePercentToBasisPoints,
  todayAsCalendarDate,
} from "../lib/money";
import { useAuth } from "../auth/useAuth";
import { Field } from "../components/Field";

/**
 * UC-05 and UC-06 — record a shared expense and choose how it is split.
 *
 * The defaults are chosen for NFR-01 (a typical expense in at most four
 * interactions from the dashboard): the date is today, the payer is you,
 * everyone is included, and the split is equal. So the common case is
 * Add expense → description → amount → Save.
 *
 * Shares are never calculated here. The preview asks the server, which is the
 * only place the split rules live, so what the member reviews (UC-05 step 7)
 * is exactly what gets stored.
 */

type LoadState =
  | { status: "loading" }
  | { status: "ready"; household: Household; members: Member[] }
  | { status: "no-household" }
  | { status: "error" };

export function AddExpensePage() {
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

        const { members } = await api.members(household.id);
        if (cancelled) return;
        setState({ status: "ready", household, members });
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

  if (state.status === "loading") {
    return (
      <main className="page" aria-busy="true">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (state.status === "no-household") {
    // Nothing to add an expense to; the dashboard offers to create one.
    return <Navigate to="/" replace />;
  }

  if (state.status === "error") {
    return (
      <main className="page">
        <h1>Something went wrong</h1>
        <p className="muted">We could not load your household.</p>
        <p className="page-actions">
          <Link to="/">Back to the dashboard</Link>
        </p>
      </main>
    );
  }

  return (
    <ExpenseForm
      household={state.household}
      members={state.members}
      currentUserId={user?.id ?? null}
    />
  );
}

const SPLIT_METHODS: { value: SplitMethod; label: string }[] = [
  { value: "EQUAL", label: "Equally" },
  { value: "CUSTOM", label: "By amount" },
  { value: "PERCENTAGE", label: "By percentage" },
];

type Preview = { key: string; shares?: Share[]; error?: string };

function ExpenseForm({
  household,
  members,
  currentUserId,
}: {
  household: Household;
  members: Member[];
  currentUserId: string | null;
}) {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const payerId = useId();
  const participantsErrorId = useId();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayAsCalendarDate);
  // UC-05 step 3: the payer defaults to the member recording the expense.
  const [paidByUserId, setPaidByUserId] = useState(() =>
    members.some((m) => m.userId === currentUserId)
      ? (currentUserId as string)
      : members[0]?.userId ?? ""
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(members.map((m) => m.userId))
  );
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("EQUAL");
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [percents, setPercents] = useState<Record<string, string>>({});

  // Client-side errors are only shown once the member has tried to save, so
  // an empty form is not covered in red before anything has been typed.
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  // Members stay in join order, which is the order the contract asks for.
  const participants = members.filter((m) => selected.has(m.userId));
  const totalCents = parseDollarsToCents(amount);

  const draft = buildDraft();
  const errors = { ...serverErrors, ...(attempted ? draft.errors : {}) };

  // The preview only needs the split, not the description, so it runs as soon
  // as the amount and shares are usable. The server validates the whole body,
  // though, so a placeholder stands in for a description not yet typed.
  const previewKey = draft.split
    ? JSON.stringify({
        ...draft.split,
        description: description.trim() || "Preview",
        expenseDate: expenseDate || todayAsCalendarDate(),
      })
    : null;

  useEffect(() => {
    if (!previewKey) return;
    let cancelled = false;

    // Debounced, so typing "123.45" asks once rather than six times.
    const timer = setTimeout(async () => {
      try {
        const input = JSON.parse(previewKey) as ExpenseInput;
        const { shares } = await api.previewExpense(household.id, input);
        if (!cancelled) setPreview({ key: previewKey, shares });
      } catch (error) {
        if (cancelled) return;
        if (isUnauthenticated(error)) {
          void refresh();
          return;
        }
        setPreview({
          key: previewKey,
          error:
            error instanceof ApiError
              ? error.message
              : "Could not calculate the split.",
        });
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [previewKey, household.id, refresh]);

  // A preview computed for different inputs is stale; never show it.
  const currentPreview = preview?.key === previewKey ? preview : null;

  /**
   * Everything the form currently holds, checked. `split` is set when the
   * inputs are enough to preview; `input` when they are enough to save.
   */
  function buildDraft(): {
    errors: Record<string, string>;
    split: Omit<ExpenseInput, "description" | "expenseDate"> | null;
    input: ExpenseInput | null;
  } {
    const found: Record<string, string> = {};

    if (description.trim() === "") {
      found.description = "Description is required.";
    }
    if (amount.trim() === "") {
      found.totalAmountCents = "Enter the amount.";
    } else if (totalCents === null) {
      found.totalAmountCents =
        "Enter an amount like 12.34, with at most two decimal places.";
    } else if (totalCents === 0) {
      found.totalAmountCents = "The amount must be more than zero.";
    }
    if (expenseDate === "") {
      found.expenseDate = "Choose the date of the expense.";
    }
    if (participants.length === 0) {
      found.participants = "Choose at least one person to split with.";
    }

    const split: Omit<ExpenseInput, "description" | "expenseDate">["participants"] =
      [];

    for (const member of participants) {
      if (splitMethod === "CUSTOM") {
        const cents = parseDollarsToCents(customAmounts[member.userId] ?? "");
        if (cents === null) {
          found[`share-${member.userId}`] = "Enter an amount like 12.34.";
        }
        split.push({ userId: member.userId, amountCents: cents ?? 0 });
      } else if (splitMethod === "PERCENTAGE") {
        const points = parsePercentToBasisPoints(percents[member.userId] ?? "");
        if (points === null) {
          found[`share-${member.userId}`] = "Enter a percentage like 33.33.";
        }
        split.push({ userId: member.userId, percentBasisPoints: points ?? 0 });
      } else {
        split.push({ userId: member.userId });
      }
    }

    const splitReady =
      totalCents !== null &&
      totalCents > 0 &&
      participants.length > 0 &&
      !Object.keys(found).some((key) => key.startsWith("share-"));

    const splitBody = splitReady
      ? {
          totalAmountCents: totalCents as number,
          paidByUserId,
          splitMethod,
          participants: split,
        }
      : null;

    return {
      errors: found,
      split: splitBody,
      input:
        splitBody && Object.keys(found).length === 0
          ? {
              ...splitBody,
              description: description.trim(),
              expenseDate,
            }
          : null,
    };
  }

  function toggleParticipant(userId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setServerErrors({});
    setFormError(null);

    if (!draft.input) return;

    setSubmitting(true);
    try {
      const { expense } = await api.createExpense(household.id, draft.input);
      navigate("/", {
        state: {
          notice: `Saved “${expense.description}” for ${formatCents(
            expense.totalAmountCents
          )}.`,
        },
      });
    } catch (error) {
      if (isUnauthenticated(error)) {
        void refresh();
        return;
      }
      if (error instanceof ApiError && error.code === "VALIDATION_FAILED") {
        setServerErrors(error.fields);
      } else {
        setFormError(
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Please try again."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  const nameWithYou = (member: Member) =>
    member.userId === currentUserId ? `${member.name} (you)` : member.name;

  return (
    <main className="page">
      <h1>Add an expense</h1>
      <p className="muted">{household.name}</p>

      <form className="auth-form expense-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <Field
          label="Description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          placeholder="e.g. Groceries"
          maxLength={200}
          required
        />

        <Field
          label="Amount ($)"
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.totalAmountCents}
          placeholder="0.00"
          required
        />

        <Field
          label="Date"
          name="expenseDate"
          type="date"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
          error={errors.expenseDate}
          required
        />

        <div className="field">
          <label htmlFor={payerId}>Paid by</label>
          <select
            id={payerId}
            value={paidByUserId}
            onChange={(e) => setPaidByUserId(e.target.value)}
          >
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {nameWithYou(member)}
              </option>
            ))}
          </select>
        </div>

        <fieldset
          className="choice-group"
          aria-describedby={errors.participants ? participantsErrorId : undefined}
        >
          <legend>Split between</legend>
          {members.map((member) => (
            <label key={member.userId} className="choice">
              <input
                type="checkbox"
                checked={selected.has(member.userId)}
                onChange={() => toggleParticipant(member.userId)}
              />
              {nameWithYou(member)}
            </label>
          ))}
          {errors.participants && (
            <p className="field-error" id={participantsErrorId}>
              {errors.participants}
            </p>
          )}
        </fieldset>

        <fieldset className="choice-group">
          <legend>How to split</legend>
          {SPLIT_METHODS.map((method) => (
            <label key={method.value} className="choice">
              <input
                type="radio"
                name="splitMethod"
                value={method.value}
                checked={splitMethod === method.value}
                onChange={() => setSplitMethod(method.value)}
              />
              {method.label}
            </label>
          ))}
        </fieldset>

        {splitMethod !== "EQUAL" &&
          participants.map((member) =>
            splitMethod === "CUSTOM" ? (
              <Field
                key={`custom-${member.userId}`}
                label={`${nameWithYou(member)} owes ($)`}
                inputMode="decimal"
                value={customAmounts[member.userId] ?? ""}
                onChange={(e) =>
                  setCustomAmounts((current) => ({
                    ...current,
                    [member.userId]: e.target.value,
                  }))
                }
                error={errors[`share-${member.userId}`]}
                placeholder="0.00"
              />
            ) : (
              <Field
                key={`percent-${member.userId}`}
                label={`Share for ${nameWithYou(member)} (%)`}
                inputMode="decimal"
                value={percents[member.userId] ?? ""}
                onChange={(e) =>
                  setPercents((current) => ({
                    ...current,
                    [member.userId]: e.target.value,
                  }))
                }
                error={errors[`share-${member.userId}`]}
                placeholder="0"
              />
            )
          )}

        <SplitSummary
          splitMethod={splitMethod}
          totalCents={totalCents}
          split={draft.split}
        />

        <section className="panel split-preview" aria-live="polite">
          <h2>Each person's share</h2>
          {!previewKey && (
            <p className="muted">
              Enter the amount and choose who is splitting it to see each share.
            </p>
          )}
          {previewKey && !currentPreview && <p className="muted">Calculating…</p>}
          {currentPreview?.error && (
            <p className="field-error">{currentPreview.error}</p>
          )}
          {currentPreview?.shares && (
            <ShareList shares={currentPreview.shares} totalCents={totalCents ?? 0} />
          )}
        </section>

        <div className="form-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save expense"}
          </button>
          <Link to="/">Cancel</Link>
        </div>
      </form>
    </main>
  );
}

/**
 * For custom and percentage splits, how far the entered figures are from
 * adding up — worked out from the member's own inputs, so they can see which
 * way to adjust before the server's check rejects it (UC-06 C3a, P3a).
 */
function SplitSummary({
  splitMethod,
  totalCents,
  split,
}: {
  splitMethod: SplitMethod;
  totalCents: number | null;
  split: Omit<ExpenseInput, "description" | "expenseDate"> | null;
}) {
  if (splitMethod === "EQUAL" || !split) return null;

  if (splitMethod === "CUSTOM") {
    const assigned = split.participants.reduce(
      (sum, p) => sum + (p.amountCents ?? 0),
      0
    );
    const left = (totalCents ?? 0) - assigned;
    return (
      <p className={left === 0 ? "muted" : "field-error"}>
        {formatCents(assigned)} of {formatCents(totalCents ?? 0)} assigned
        {left > 0 && ` — ${formatCents(left)} left to assign`}
        {left < 0 && ` — ${formatCents(-left)} too much`}
      </p>
    );
  }

  const points = split.participants.reduce(
    (sum, p) => sum + (p.percentBasisPoints ?? 0),
    0
  );
  return (
    <p className={points === 10000 ? "muted" : "field-error"}>
      {formatBasisPoints(points)} of 100% assigned
    </p>
  );
}

function ShareList({ shares, totalCents }: { shares: Share[]; totalCents: number }) {
  const sum = shares.reduce((total, share) => total + share.amountOwedCents, 0);

  return (
    <ul className="share-list">
      {shares.map((share) => (
        <li key={share.userId}>
          <span>
            {share.name}
            {share.percentBasisPoints !== null && (
              <span className="muted"> · {formatBasisPoints(share.percentBasisPoints)}</span>
            )}
          </span>
          <span className="amount">{formatCents(share.amountOwedCents)}</span>
        </li>
      ))}
      <li className="share-total">
        <span>Total</span>
        <span className="amount">
          {formatCents(sum)} {sum === totalCents ? "✓ adds up" : ""}
        </span>
      </li>
    </ul>
  );
}
