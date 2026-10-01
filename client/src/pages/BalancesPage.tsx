import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ApiError,
  api,
  isUnauthenticated,
  type Balance,
  type BalanceSummary,
  type Household,
  type Settlement,
} from "../lib/api";
import { formatCents, parseDollarsToCents } from "../lib/money";
import { describeBalance, describeSettlement, paymentFor } from "../lib/balances";
import { useAuth } from "../auth/useAuth";
import { Field } from "../components/Field";

/**
 * UC-07 and UC-08 — what you owe, what you are owed, and recording that a
 * debt was paid outside the app.
 *
 * Balances are fetched fresh after every payment rather than adjusted on the
 * client: the server derives them from the records (NFR-03), and the client
 * never keeps a second copy that could disagree.
 */

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      household: Household;
      summary: BalanceSummary;
      settlements: Settlement[];
    }
  | { status: "no-household" }
  | { status: "error" };

export function BalancesPage() {
  const { user, refresh } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async (): Promise<LoadState> => {
    const { household } = await api.currentHousehold();
    if (!household) return { status: "no-household" };

    const [summary, { settlements }] = await Promise.all([
      api.balances(household.id),
      api.settlements(household.id),
    ]);
    return { status: "ready", household, summary, settlements };
  }, []);

  useEffect(() => {
    let cancelled = false;

    load().then(
      (next) => {
        if (!cancelled) setState(next);
      },
      (error) => {
        if (cancelled) return;
        if (isUnauthenticated(error)) {
          void refresh();
          return;
        }
        setState({ status: "error" });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [load, refresh]);

  /** After a payment: ask the server again rather than adjusting locally. */
  const reload = useCallback(async () => {
    try {
      setState(await load());
    } catch (error) {
      if (isUnauthenticated(error)) {
        void refresh();
        return;
      }
      setState({ status: "error" });
    }
  }, [load, refresh]);

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

  if (state.status === "error" || !user) {
    return (
      <main className="page">
        <h1>Something went wrong</h1>
        <p className="muted">We could not load your balances.</p>
        <p className="join-actions">
          <Link to="/">Back to the dashboard</Link>
        </p>
      </main>
    );
  }

  const { household, summary, settlements } = state;

  return (
    <main className="page">
      <h1>Balances</h1>
      <p className="muted">
        {household.name} · <Link to="/">Back to the dashboard</Link>
      </p>

      <p className="balance-totals">
        You owe <strong>{formatCents(summary.totals.youOweCents)}</strong> · You are
        owed <strong>{formatCents(summary.totals.owedToYouCents)}</strong>
      </p>

      <section className="balance-section" aria-labelledby="balances-heading">
        <h2 id="balances-heading">With each roommate</h2>
        {summary.balances.length === 0 ? (
          <p className="muted">
            Nobody else is in this household yet. Invite a roommate from the
            dashboard.
          </p>
        ) : (
          <ul className="balance-list">
            {summary.balances.map((balance) => (
              <BalanceRow
                key={balance.userId}
                balance={balance}
                householdId={household.id}
                currentUserId={user.id}
                onRecorded={reload}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="balance-section" aria-labelledby="payments-heading">
        <h2 id="payments-heading">Payments recorded</h2>
        {settlements.length === 0 ? (
          <p className="muted">No payments recorded yet.</p>
        ) : (
          <ul className="settlement-list">
            {settlements.map((settlement) => (
              <li key={settlement.id}>
                <span>{describeSettlement(settlement, user.id)}</span>
                <span className="muted">
                  {new Date(settlement.settledAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                  {settlement.note && ` · ${settlement.note}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function BalanceRow({
  balance,
  householdId,
  currentUserId,
  onRecorded,
}: {
  balance: Balance;
  householdId: string;
  currentUserId: string;
  onRecorded: () => Promise<void>;
}) {
  const { refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { text, direction } = describeBalance(balance);
  const payment = paymentFor(balance, currentUserId);

  function openForm() {
    if (!payment) return;
    // UC-08 step 3: default to the full outstanding balance.
    setAmount((payment.amountCents / 100).toFixed(2));
    setNote("");
    setFieldErrors({});
    setFormError(null);
    setOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!payment) return;
    setFieldErrors({});
    setFormError(null);

    const amountCents = parseDollarsToCents(amount);
    if (amountCents === null || amountCents === 0) {
      setFieldErrors({
        amountCents: "Enter an amount more than zero, like 12.34.",
      });
      return;
    }
    if (amountCents > payment.amountCents) {
      setFieldErrors({
        amountCents: `That is more than is owed. The most you can record is ${formatCents(
          payment.amountCents
        )}.`,
      });
      return;
    }

    setSubmitting(true);
    try {
      await api.createSettlement(householdId, {
        fromUserId: payment.fromUserId,
        toUserId: payment.toUserId,
        amountCents,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setOpen(false);
      await onRecorded();
    } catch (error) {
      if (isUnauthenticated(error)) {
        void refresh();
        return;
      }
      if (error instanceof ApiError && error.code === "VALIDATION_FAILED") {
        setFieldErrors(error.fields);
      } else if (error instanceof ApiError && error.code === "EXCEEDS_BALANCE") {
        // UC-08 4e: the balance changed since this page loaded — another
        // payment or expense was recorded. Show the current balance rather
        // than the stale figure, and say why nothing was recorded.
        setFormError(
          `Nothing was recorded: ${error.message.toLowerCase()} The balance has changed since you opened this page, so it has been updated.`
        );
        setOpen(false);
        await onRecorded();
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
    <li className="balance-row">
      <div className="balance-line">
        <span className={`balance-text balance-${direction}`}>{text}</span>
        {payment && !open && (
          <button type="button" onClick={openForm}>
            Record payment
          </button>
        )}
      </div>

      {/* Outside the form: after a refused payment the balance is reloaded,
          and if it is now zero the form is gone — the reason must not go
          with it. */}
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}

      {payment && open && (
        <form className="auth-form settlement-form" onSubmit={handleSubmit} noValidate>
          <p className="muted">
            {payment.label}. RoomSync does not move money; this records a payment
            made elsewhere.
          </p>

          <Field
            label="Amount paid ($)"
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={fieldErrors.amountCents}
          />

          <Field
            label="Note (optional)"
            name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={fieldErrors.note}
            placeholder="e.g. Venmo"
            maxLength={200}
          />

          <div className="join-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? "Recording…" : "Record payment"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
