import { useEffect, useState } from "react";
import { api, isUnauthenticated, type Member } from "../lib/api";
import { useAuth } from "../auth/useAuth";

/**
 * The household's members, from GET /households/:householdId/members.
 *
 * Loads on its own rather than through the dashboard so one slow or failed
 * request does not blank the whole screen — the other panels still render.
 */

type LoadState =
  | { status: "loading" }
  | { status: "ready"; members: Member[] }
  | { status: "error" };

export function MembersPanel({ householdId }: { householdId: string }) {
  const { refresh } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const { members } = await api.members(householdId);
        if (cancelled) return;
        setState({ status: "ready", members });
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
  }, [householdId, refresh]);

  return (
    <section className="panel" aria-busy={state.status === "loading"}>
      <h2>Members</h2>

      {state.status === "loading" && <p className="muted">Loading…</p>}

      {state.status === "error" && (
        <p className="muted">Could not load members.</p>
      )}

      {state.status === "ready" && (
        <ul className="member-list">
          {state.members.map((member) => (
            <li key={member.userId}>
              {member.name}
              {member.role === "OWNER" && <span className="muted"> · owner</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
