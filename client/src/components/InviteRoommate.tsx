import { useRef, useState } from "react";
import { ApiError, api, isUnauthenticated } from "../lib/api";
import { useAuth } from "../auth/useAuth";

/**
 * UC-04 steps 1-4 — the owner creates an invitation link and sends it
 * themselves. RoomSync does not send email in the MVP.
 *
 * Only rendered for the owner, but that is presentation: the server answers a
 * member with 403 NOT_HOUSEHOLD_OWNER regardless (UC-04 1a).
 */

type State =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "ready"; link: string; expiresAt: string }
  | { status: "error"; message: string };

export function InviteRoommate({ householdId }: { householdId: string }) {
  const { refresh } = useAuth();
  const [state, setState] = useState<State>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  async function createLink() {
    setState({ status: "creating" });
    setCopied(false);

    try {
      const { invitation } = await api.createInvitation(householdId);
      setState({
        status: "ready",
        link: `${window.location.origin}/join/${invitation.token}`,
        expiresAt: invitation.expiresAt,
      });
    } catch (error) {
      if (isUnauthenticated(error)) {
        void refresh();
        return;
      }
      setState({
        status: "error",
        message:
          error instanceof ApiError
            ? error.message
            : "Could not create an invitation. Please try again.",
      });
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard access can be refused. Selecting the text leaves the
      // member one keystroke from copying it themselves.
      linkRef.current?.select();
    }
  }

  if (state.status === "ready") {
    const expires = new Date(state.expiresAt).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    return (
      <div className="invite">
        <p className="muted">
          Send this link to your roommate. It works once and expires on{" "}
          {expires}.
        </p>
        <div className="invite-link">
          <input
            ref={linkRef}
            readOnly
            value={state.link}
            aria-label="Invitation link"
            onFocus={(e) => e.target.select()}
          />
          <button type="button" onClick={() => void copyLink(state.link)}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="muted" role="status">
          {copied ? "Link copied to the clipboard." : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="invite">
      {state.status === "error" && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
      <button
        type="button"
        onClick={() => void createLink()}
        disabled={state.status === "creating"}
      >
        {state.status === "creating" ? "Creating link…" : "Invite a roommate"}
      </button>
    </div>
  );
}
