import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, isUnauthenticated, type ActivityItem, type Dashboard } from "../lib/api";
import { useAuth } from "../auth/useAuth";
import { CreateHouseholdPage } from "./CreateHouseholdPage";
import { MembersPanel } from "../components/MembersPanel";
import { ExpensesPanel } from "../components/ExpensesPanel";
import { describeBalance } from "../lib/balances";
import { dueLabel } from "../lib/chores";
import { describeActivity, formatActivityDate, summarizeBalances } from "../lib/activity";
import { todayAsCalendarDate } from "../lib/money";

/**
 * UC-10 — the household dashboard: who lives here, what I owe, what I am
 * supposed to do, and what happened recently, on one screen.
 *
 * Asks the server which screen applies first (UC-10 2a): a member of no
 * household gets the create-household screen. Everything else comes from one
 * dashboard request (NFR-02). Every panel has an empty state naming the next
 * step, so a new household never shows a blank panel (UC-10 4a-6a).
 */

type LoadState =
  | { status: "loading" }
  | { status: "no-household" }
  | { status: "ready"; dashboard: Dashboard }
  | { status: "error" };

export function DashboardPage() {
  const { user, refresh } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  // Set by the add-expense page after a save, so the member sees it landed.
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;

  // Bumped by "Try again" and after creating a household, to re-run the
  // effect below with the same loading logic as the first load.
  const [attempt, setAttempt] = useState(0);

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

        const dashboard = await api.dashboard(household.id);
        if (cancelled) return;
        setState({ status: "ready", dashboard });
      } catch (error) {
        if (cancelled) return;
        if (isUnauthenticated(error)) {
          // Retrying cannot fix a missing session. Re-checking it lets
          // RequireAuth send the user to log in; stay on "loading" until then.
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
  }, [attempt, refresh]);

  function reload() {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }

  if (state.status === "loading") {
    return (
      <main className="page" aria-busy="true">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="page">
        <h1>Something went wrong</h1>
        <p className="muted">
          We could not load your household. Check that the server is running.
        </p>
        <button type="button" onClick={reload}>
          Try again
        </button>
      </main>
    );
  }

  if (state.status === "no-household") {
    return <CreateHouseholdPage onCreated={reload} />;
  }

  const { household, members, balances, upcomingChores, recentActivity } = state.dashboard;
  const currentUserId = user?.id ?? "";
  const today = todayAsCalendarDate();

  return (
    <main className="page">
      <h1>{household.name}</h1>

      <p className="muted">
        Signed in as {user?.name}
        {household.role === "OWNER" && " · You own this household"}
      </p>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <p className="page-actions">
        <Link className="button-link" to="/expenses/new">
          + Add expense
        </Link>{" "}
        <Link className="button-link" to="/chores">
          Chores
        </Link>{" "}
        <Link className="button-link" to="/balances">
          Balances
        </Link>
      </p>

      <div className="panel-grid">
        <MembersPanel
          householdId={household.id}
          members={members}
          canInvite={household.role === "OWNER"}
        />

        <section className="panel">
          <h2>Your balance</h2>
          <p className="balance-summary">{summarizeBalances(balances)}</p>

          {balances.balances.length === 0 ? (
            <p className="muted">
              Balances appear here once a roommate joins and you share an expense.
            </p>
          ) : (
            <>
              <ul className="dashboard-list">
                {balances.balances.map((balance) => {
                  const { text, direction } = describeBalance(balance);
                  return (
                    <li
                      key={balance.userId}
                      className={direction === "settled" ? "muted" : undefined}
                    >
                      {text}
                    </li>
                  );
                })}
              </ul>
              <p className="panel-link">
                <Link to="/balances">Record a payment</Link>
              </p>
            </>
          )}
        </section>

        <section className="panel">
          <h2>Your chores</h2>

          {upcomingChores.length === 0 ? (
            <p className="muted">
              Nothing is assigned to you. <Link to="/chores">Open chores</Link> to
              add one or take an unassigned one.
            </p>
          ) : (
            <>
              <ul className="dashboard-list">
                {upcomingChores.map((chore) => {
                  const due = dueLabel(chore.dueDate, today);
                  return (
                    <li key={chore.id}>
                      <span className="dashboard-item">{chore.title}</span>
                      <span className={due.overdue ? "overdue" : "muted"}>
                        {due.overdue && <span aria-hidden="true">⚠ </span>}
                        {due.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="panel-link">
                <Link to="/chores">Mark chores complete</Link>
              </p>
            </>
          )}
        </section>

        <section className="panel">
          <h2>Recent activity</h2>

          {recentActivity.length === 0 ? (
            <p className="muted">
              Nothing has happened yet. <Link to="/expenses/new">Add an expense</Link>{" "}
              to get started.
            </p>
          ) : (
            <ul className="dashboard-list">
              {recentActivity.map((item) => (
                <li key={`${item.type}-${activityId(item)}`}>
                  <span className="dashboard-item">{describeActivity(item, currentUserId)}</span>
                  <span className="muted">{formatActivityDate(item.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ExpensesPanel householdId={household.id} />
      </div>
    </main>
  );
}

function activityId(item: ActivityItem): string {
  switch (item.type) {
    case "EXPENSE":
      return item.expense.id;
    case "SETTLEMENT":
      return item.settlement.id;
    case "CHORE_COMPLETED":
      return item.chore.id;
  }
}
