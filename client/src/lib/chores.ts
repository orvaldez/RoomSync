/**
 * How a chore's due date reads on screen. Pure, so the day arithmetic can be
 * tested without a clock or a browser.
 *
 * Dates are the contract's `YYYY-MM-DD` strings and `today` is the member's own
 * local date (see `todayAsCalendarDate`), so "due today" means today where the
 * member is, not in UTC.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  // Both parsed as UTC midnight, so daylight-saving changes never make a
  // day 23 or 25 hours long.
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * UC-09 4a: a chore can be due in the past, and the interface marks it
 * overdue. Returned as words, never only a colour, so the state reads the same
 * to everyone.
 */
export function dueLabel(
  dueDate: string | null,
  today: string
): { text: string; overdue: boolean } {
  if (!dueDate) {
    return { text: "No due date", overdue: false };
  }

  const days = daysBetween(today, dueDate);

  if (days < 0) {
    const late = -days;
    return {
      text: `Overdue by ${late} ${late === 1 ? "day" : "days"}`,
      overdue: true,
    };
  }
  if (days === 0) return { text: "Due today", overdue: false };
  if (days === 1) return { text: "Due tomorrow", overdue: false };

  return { text: `Due ${formatCalendarDate(dueDate)}`, overdue: false };
}

/** "2026-10-02" -> "Fri, Oct 2", read as a calendar date with no time zone shift. */
export function formatCalendarDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
