import { useAuth } from "../auth/useAuth";

/**
 * Placeholder for UC-10.
 *
 * The real dashboard shows household members, the user's balances, their
 * upcoming chores, and recent activity. None of those endpoints exist yet, so
 * this shows what US-02 actually proves: the session survives a refresh and
 * the server knows who you are.
 */
export function DashboardPage() {
  const { user } = useAuth();

  return (
    <main className="page">
      <h1>Welcome, {user?.name}</h1>

      <p className="muted">
        You are signed in as {user?.email}. Your session persists across a page
        refresh and a server restart.
      </p>

      <section className="panel">
        <h2>Next up</h2>
        <p className="muted">
          Household creation, expenses and balances land here as US-03 and
          US-05 through US-07 are built.
        </p>
      </section>
    </main>
  );
}
