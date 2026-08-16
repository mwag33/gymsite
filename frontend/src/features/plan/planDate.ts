// Shared date helpers for the plan/session/log surfaces. `Session.date` is
// always a real "YYYY-MM-DD" string (user-local calendar date, stamped
// server-side from UserSettings.timezone) — this file is the single place
// both Home and Log resolve "today" and render weekday labels, so a log and
// a session always match on the same local calendar key.

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

// Firestore Timestamp fields are typed `unknown` on the client (see
// lib/types.ts comment), so duck-type rather than importing the Timestamp
// class — same pattern as pages/progress/progressUtils.ts.
export function toDate(value: unknown): Date | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

/**
 * The device's local calendar date as "YYYY-MM-DD", built from local
 * date components (not `toISOString`, which is UTC and mismatches near
 * midnight in any timezone behind UTC).
 */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parses a "YYYY-MM-DD" string as a local-midnight Date (not UTC midnight —
 * `new Date("YYYY-MM-DD")` parses as UTC and renders the previous weekday in
 * timezones behind UTC).
 */
export function parseLocalDateKey(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

/** Full weekday name for a session's date string, e.g. "Monday". */
export function weekdayLabel(dateStr: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(parseLocalDateKey(dateStr));
}

/** Single-letter weekday for compact chips, e.g. "M". */
export function weekdayLetter(dateStr: string): string {
  return WEEKDAY_LETTERS[parseLocalDateKey(dateStr).getDay()];
}

/** Day-of-month number for a session's date string, e.g. 16. */
export function dayOfMonth(dateStr: string): number {
  return parseLocalDateKey(dateStr).getDate();
}

/** Short "Mon, Aug 16" style label. */
export function shortDateLabel(dateStr: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(parseLocalDateKey(dateStr));
}

export function addDaysToKey(dateStr: string, days: number): string {
  const d = parseLocalDateKey(dateStr);
  d.setDate(d.getDate() + days);
  return toLocalDateKey(d);
}
