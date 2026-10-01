import type { Member } from "../lib/api";
import { InviteRoommate } from "./InviteRoommate";

/**
 * The household's members (UC-10 step 3), from the dashboard response.
 *
 * Takes the list rather than fetching it, so the dashboard loads in one
 * request (NFR-02) and every panel describes the same moment.
 */
export function MembersPanel({
  householdId,
  members,
  canInvite,
}: {
  householdId: string;
  members: Member[];
  /** Whether to offer "Invite a roommate" — the owner only (UC-04 1a). */
  canInvite: boolean;
}) {
  return (
    <section className="panel">
      <h2>Members</h2>

      <ul className="member-list">
        {members.map((member) => (
          <li key={member.userId}>
            {member.name}
            {member.role === "OWNER" && <span className="muted"> · owner</span>}
          </li>
        ))}
      </ul>

      {members.length === 1 && (
        <p className="muted">
          {canInvite
            ? "It is just you so far. Invite a roommate to start sharing costs."
            : "It is just you so far."}
        </p>
      )}

      {canInvite && <InviteRoommate householdId={householdId} />}
    </section>
  );
}
