import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, isUnauthenticated } from "../lib/api";
import { useAuth } from "../auth/useAuth";

/**
 * UC-04 steps 5-12 — where an invitation link lands.
 *
 * Behind RequireAuth, so a visitor who is not signed in is sent to log in or
 * register first and brought back here afterwards (step 7). The page then
 * shows the household's name and asks them to confirm (step 8) rather than
 * joining on page load, so opening a link is never enough on its own to put
 * someone in a household.
 */

type State =
  | { status: "loading" }
  | { status: "ready"; householdName: string; expiresAt: string }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "already-in-household"; message: string }
  | { status: "error" };

/** The page state for an invitation error the server can return. */
function stateForError(error: unknown): State {
  if (error instanceof ApiError) {
    if (error.code === "INVITATION_INVALID") return { status: "invalid" };
    if (error.code === "INVITATION_EXPIRED") return { status: "expired" };
    if (error.code === "ALREADY_IN_HOUSEHOLD") {
      return { status: "already-in-household", message: error.message };
    }
  }
  return { status: "error" };
}

export function JoinPage() {
  const { token = "" } = useParams();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: "loading" });
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const { invitation } = await api.invitation(token);
        if (cancelled) return;
        setState({ status: "ready", ...invitation });
      } catch (error) {
        if (cancelled) return;
        if (isUnauthenticated(error)) {
          void refresh();
          return;
        }
        setState(stateForError(error));
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [token, refresh]);

  async function join() {
    setJoining(true);

    try {
      await api.acceptInvitation(token);
      // Step 12: the dashboard, which now finds the household.
      navigate("/", { replace: true });
    } catch (error) {
      if (isUnauthenticated(error)) {
        void refresh();
        return;
      }
      setState(stateForError(error));
      setJoining(false);
    }
  }

  if (state.status === "loading") {
    return (
      <main className="page" aria-busy="true">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (state.status === "ready") {
    const expires = new Date(state.expiresAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
    });

    return (
      <main className="page">
        <h1>Join {state.householdName}?</h1>
        <p className="muted">
          You have been invited to share expenses and chores with this
          household. The invitation expires on {expires}.
        </p>
        <div className="join-actions">
          <button type="button" onClick={() => void join()} disabled={joining}>
            {joining ? "Joining…" : `Join ${state.householdName}`}
          </button>
          <Link to="/">Not now</Link>
        </div>
      </main>
    );
  }

  const messages: Record<Exclude<State["status"], "loading" | "ready">, [string, string]> = {
    invalid: [
      "This invitation is not valid",
      "It may have been used already. Ask the person who sent it for a new link.",
    ],
    expired: [
      "This invitation has expired",
      "Invitations last seven days. Ask the person who sent it for a new link.",
    ],
    "already-in-household": [
      "You are already in a household",
      state.status === "already-in-household"
        ? `${state.message} RoomSync supports one household per person for now.`
        : "",
    ],
    error: ["Something went wrong", "We could not open this invitation. Please try again."],
  };

  const [heading, detail] = messages[state.status];

  return (
    <main className="page">
      <h1>{heading}</h1>
      <p className="muted">{detail}</p>
      <p className="join-actions">
        <Link to="/">Go to the dashboard</Link>
      </p>
    </main>
  );
}
