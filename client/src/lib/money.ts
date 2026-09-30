/**
 * Dollars on screen, integer cents on the wire (FR-18).
 *
 * Parsing reads the digits as text rather than going through parseFloat, so
 * "0.29" becomes exactly 29 cents and never 28.999999999999996. Percentages
 * work the same way into integer basis points, where 100% is 10000.
 */

/** Digits with at most two decimal places, e.g. "12", "12.3", "12.34", ".5". */
const DECIMAL = /^(\d*)(?:\.(\d{0,2}))?$/;

/**
 * Whole hundredths from a decimal string: "12.34" -> 1234. Null when the text
 * is not a plain number or has more than two decimal places (UC-05 2c), rather
 * than rounding it silently.
 */
function parseHundredths(text: string): number | null {
  const match = DECIMAL.exec(text);
  if (!match) return null;

  const [, whole, fraction] = match;
  if (whole === "" && !fraction) return null;

  const value = Number(whole || "0") * 100 + Number((fraction ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(value) ? value : null;
}

/** "$1,234.56" or "1234.56" -> 123456. Allows a leading "$" and commas. */
export function parseDollarsToCents(input: string): number | null {
  return parseHundredths(input.trim().replace(/^\$/, "").replaceAll(",", ""));
}

/** "33.33" or "33.33%" -> 3333 basis points. */
export function parsePercentToBasisPoints(input: string): number | null {
  return parseHundredths(input.trim().replace(/%$/, ""));
}

/** 123456 -> "$1,234.56". Negative amounts get a leading minus sign. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/** 3333 -> "33.33%", 5000 -> "50%". */
export function formatBasisPoints(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100);
  const fraction = basisPoints % 100;
  return fraction === 0
    ? `${whole}%`
    : `${whole}.${String(fraction).padStart(2, "0")}%`;
}

/** Today in the user's own time zone, as the contract's `YYYY-MM-DD`. */
export function todayAsCalendarDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
