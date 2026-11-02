import { useEffect, useState } from "react";
import { ApiError, api, isUnauthenticated, type Invitation } from "../lib/api";
import { useAuth } from "../auth/useAuth";
import { describeInvitation } from "../lib/invitations";

/**
 * UC-14 — the owner's live invitation links, each of which can be revoked so
 * a link shared by mistake can no longer add anyone.
 *
 * Only rendered for the owner, but that is presentation: the server answers a
 * member with 403 NOT_HOUSEHOLD_OWNER regardless (UC-14 1a).
 */

type ListState =
  | { status: "loading" }
  | { status: "ready"; invitations: Invitation[] }
  | { status: "error"; message: string };

export function PendingInvitations({
  householdId,
  reloadKey,
}: {
  householdId: string;
  /** Changes when a new link is created, so the list refetches. */
  reloadKey: number;
}) {
  const { refresh } = useAuth();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [revokeError, setRevokeError] = useState("");

  useEffect(() => {
    let cancelled = false;

    api
      .pendingInvitations(householdId)
      .then(({ invitations }) => {
        if (!cancelled) setList({ status: "ready", invitations });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isUnauthenticated(error)) {
          void refresh();
          return;
        }
        setList({
          status: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "Could not load the invitation links.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [householdId, reloadKey, refresh]);

  async function revoke(invitationId: string) {
    setRevokingId(invitationId);
    setRevokeError("");

    try {
      await api.revokeInvitation(householdId, invitationId);
      setNotice("Link revoked. Anyone who opens it now is told it is not valid.");
      removeFromList(invitationId);
    } catch (error) {
      if (isUnauthenticated(error)) {
        void refresh();
        return;
      }
      if (error instanceof ApiError && error.code === "INVITATION_NOT_PENDING") {
        // Accepted or expired since the list loaded: it is no longer live,
        // so it leaves the list either way.
        setNotice("That link was already used or has expired, so there was nothing to revoke.");
        removeFromList(invitationId);
        return;
      }
      setRevokeError(
        error instanceof ApiError
          ? error.message
          : "Could not revoke the link. Please try again."
      );
    } finally {
      setRevokingId(null);
      setConfirmingId(null);
    }
  }

  function removeFromList(invitationId: string) {
    setList((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            invitations: current.invitations.filter((i) => i.id !== invitationId),
          }
        : current
    );
  }

  if (list.status === "loading") {
    return null;
  }

  if (list.status === "error") {
    return (
      <p className="field-error" role="alert">
        {list.message}
      </p>
    );
  }

  return (
    <div className="pending-invitations">
      {list.invitations.length > 0 && (
        <>
          <h3>Invitation links</h3>
          <ul className="invitation-list">
            {list.invitations.map((invitation) => (
              <li key={invitation.id}>
                <span>{describeInvitation(invitation)}</span>

                {confirmingId === invitation.id ? (
                  <div className="confirm" role="group" aria-label="Revoke this link?">
                    <p>
                      Revoke this link? Anyone who has it won't be able to join.
                      Roommates who already joined stay.
                    </p>
                    <div className="confirm-actions">
                      <button
                        type="button"
                        className="danger"
                        onClick={() => void revoke(invitation.id)}
                        disabled={revokingId === invitation.id}
                      >
                        {revokingId === invitation.id ? "Revoking…" : "Revoke link"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        disabled={revokingId === invitation.id}
                      >
                        Keep it
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingId(invitation.id);
                      setNotice("");
                      setRevokeError("");
                    }}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {revokeError && (
        <p className="field-error" role="alert">
          {revokeError}
        </p>
      )}
      <p className="muted" role="status">
        {notice}
      </p>
    </div>
  );
}
