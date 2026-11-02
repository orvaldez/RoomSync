import { describe, it, expect } from "vitest";
import { describeInvitation, invitationLink } from "./invitations";

// Local times, so "today" and "tomorrow" don't depend on the machine's zone.
const NOW = new Date(2026, 10, 2, 9, 0).getTime();
const CREATED = new Date(2026, 9, 30, 12, 0).toISOString();

function expiringAt(year: number, month: number, day: number, hour: number) {
  return { createdAt: CREATED, expiresAt: new Date(year, month, day, hour).toISOString() };
}

describe("describeInvitation", () => {
  it("says when it was created and how many whole days are left", () => {
    expect(describeInvitation(expiringAt(2026, 10, 6, 12), NOW)).toBe(
      "Created Oct 30 · expires in 5 days"
    );
  });

  it("rounds a part day up rather than saying 0 days", () => {
    expect(describeInvitation(expiringAt(2026, 10, 3, 8), NOW)).toBe(
      "Created Oct 30 · expires tomorrow"
    );
  });

  it("says today when it runs out later the same day", () => {
    expect(describeInvitation(expiringAt(2026, 10, 2, 18), NOW)).toBe(
      "Created Oct 30 · expires today"
    );
  });

  it("counts a full seven-day link as seven days", () => {
    const sevenDays = {
      createdAt: new Date(NOW).toISOString(),
      expiresAt: new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    expect(describeInvitation(sevenDays, NOW)).toBe("Created Nov 2 · expires in 7 days");
  });
});

describe("invitationLink", () => {
  it("builds the join link the invite button gives out", () => {
    expect(invitationLink("https://roomsync.example", "abc_123")).toBe(
      "https://roomsync.example/join/abc_123"
    );
  });
});
