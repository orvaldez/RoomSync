import type { Invitation } from "./api";
import { formatActivityDate } from "./activity";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The link a roommate opens to join (UC-04 step 4). */
export function invitationLink(origin: string, token: string): string {
  return `${origin}/join/${token}`;
}

/**
 * "Created Oct 30 · expires in 6 days" (UC-14 step 2). The expiry is counted
 * in whole days left, rounded up, so a link with an hour to go still reads
 * "expires today" rather than "in 0 days".
 */
export function describeInvitation(
  invitation: Pick<Invitation, "createdAt" | "expiresAt">,
  now: number = Date.now()
): string {
  const created = `Created ${formatActivityDate(invitation.createdAt)}`;
  const daysLeft = Math.ceil((new Date(invitation.expiresAt).getTime() - now) / DAY_MS);

  if (daysLeft <= 1) {
    const sameDay =
      new Date(invitation.expiresAt).toDateString() === new Date(now).toDateString();
    return `${created} · expires ${sameDay ? "today" : "tomorrow"}`;
  }
  return `${created} · expires in ${daysLeft} days`;
}
