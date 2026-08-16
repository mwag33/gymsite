// Shared date-key helpers for the date-anchored plan model. Not part of the
// original file plan, but needed by planEngine.ts, generateSchedule.ts,
// generateExercisesForWeek.ts, regeneratePlan.ts and planDailySweep.ts alike,
// so it lives in one small dependency-free module rather than being
// duplicated per-file. No date library is added (none was already a
// dependency) - everything here is plain Intl + UTC-noon arithmetic, which
// is sufficient for whole-calendar-day math and avoids DST-related off-by-one
// bugs that local-time Date arithmetic would introduce.

const FALLBACK_TIMEZONE = "UTC";

/**
 * Formats a JS Date as a "YYYY-MM-DD" calendar-date string in the given IANA
 * timezone. This is the one authority for "what day is it for this user" -
 * every other date-key computation in the plan engine goes through this.
 *
 * Falls back to UTC (never throws) if `timezone` is missing or invalid,
 * since `UserSettings.timezone` is a new field and may not be populated for
 * every user yet (see planDailySweep.ts).
 */
export function localDateKey(date: Date, timezone: string | null | undefined): string {
  const tz = timezone && timezone.length > 0 ? timezone : FALLBACK_TIMEZONE;
  try {
    // en-CA formats as YYYY-MM-DD, which is exactly the "YYYY-MM-DD" key
    // format the Session/PlanDoc types use.
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

function parseDateKey(dateKey: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateKey.split("-").map(Number);
  return { y, m, d };
}

/**
 * Adds (or subtracts, for negative `days`) whole calendar days to a
 * "YYYY-MM-DD" key. Uses UTC-midnight arithmetic purely as a calendar
 * calculator - the key itself carries no timezone information once it's a
 * string, so this is safe regardless of the user's actual timezone.
 */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const { y, m, d } = parseDateKey(dateKey);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Returns `b - a` in whole calendar days (positive if b is after a). */
export function diffDaysBetweenDateKeys(a: string, b: string): number {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  const ta = Date.UTC(pa.y, pa.m - 1, pa.d);
  const tb = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((tb - ta) / (24 * 60 * 60 * 1000));
}

/** Lexicographic compare works directly on "YYYY-MM-DD" strings, but this
 * documents intent at call sites and keeps sort comparators terse. */
export function compareDateKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
