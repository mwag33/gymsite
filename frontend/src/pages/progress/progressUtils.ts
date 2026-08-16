// Shared date/formatting helpers for the Progress tab. Firestore Timestamp
// fields are typed `unknown` on the client (see lib/types.ts comment), so we
// duck-type rather than importing the Timestamp class — same pattern as
// features/plan/PlanReveal.tsx and pages/home/HomePage.tsx.
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

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Monday-start by default; pass a UserSettings.weekStartsOn (0=Sun..6=Sat) when available. */
export function startOfWeek(date: Date, weekStartsOn = 1): Date {
  const day = startOfDay(date);
  const diff = (day.getDay() - weekStartsOn + 7) % 7;
  return addDays(day, -diff);
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatSessionDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// computeStreak operates on Session[] (see lib/types.ts); imported lazily via
// a type-only import to avoid a circular dependency with features/plan.
import type { Session } from "../../lib/types";

/**
 * Current and best consecutive-training-day streaks, walking backwards from
 * today. A "done"/"partial" session (any adherence, not a strict match)
 * counts toward the streak; "rest" focus days and days with no session at
 * all neither break nor extend it. "skipped"/"swapped" break the streak.
 * Pure function over the session stream Home already reads — no new
 * backend-authoritative field needed.
 */
export function computeStreak(sessions: Session[]): { current: number; best: number } {
  const trainingDays = sessions
    .filter((s) => s.focus !== "rest")
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  let best = 0;
  let running = 0;

  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // Walk chronologically; `running` at the end of the loop is the streak
  // trailing into today, i.e. "current". `best` tracks the max seen.
  for (const session of trainingDays) {
    if (session.date > todayKey) continue; // future sessions don't count yet
    if (session.status === "done" || session.status === "partial") {
      running += 1;
      best = Math.max(best, running);
    } else if (session.status === "skipped" || session.status === "swapped") {
      running = 0;
    }
    // "upcoming" (not yet reached) neither breaks nor extends.
  }

  return { current: running, best };
}
