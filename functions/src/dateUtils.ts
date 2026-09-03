// Shared date-key helpers, used by generateSchedule.ts to anchor its 7-day
// draft week to "today" in the user's own timezone. No date library is added
// (none was already a dependency) - everything here is plain Intl + UTC-noon
// arithmetic, which is sufficient for whole-calendar-day math and avoids
// DST-related off-by-one bugs that local-time Date arithmetic would introduce.

const FALLBACK_TIMEZONE = "UTC";

/**
 * Formats a JS Date as a "YYYY-MM-DD" calendar-date string in the given IANA
 * timezone. Falls back to UTC (never throws) if `timezone` is missing or
 * invalid, since `UserSettings.timezone` may not be populated for every user
 * yet.
 */
export function localDateKey(date: Date, timezone: string | null | undefined): string {
  const tz = timezone && timezone.length > 0 ? timezone : FALLBACK_TIMEZONE;
  try {
    // en-CA formats as YYYY-MM-DD, which is exactly the "YYYY-MM-DD" key
    // format DraftDay/DaySession use.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    // Invalid IANA string (e.g. corrupt/legacy data) - degrade to UTC rather
    // than throwing, matching the "default to UTC, don't throw" requirement.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: FALLBACK_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

/**
 * Adds (or subtracts, for negative `days`) whole calendar days to a
 * "YYYY-MM-DD" key. Uses UTC-midnight arithmetic purely as a calendar
 * calculator - the key itself carries no timezone information once it's a
 * string, so this is safe regardless of the user's actual timezone.
 */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
