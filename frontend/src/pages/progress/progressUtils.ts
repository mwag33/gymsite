// Shared date/formatting helpers for the Progress tab. Firestore Timestamp
// fields are typed `unknown` on the client (see lib/types.ts comment), so we
// duck-type rather than importing the Timestamp class — same pattern as
// features/plan/PlanReveal.tsx and pages/home/HomePage.tsx.
import type { TrainingPlanFocus } from "../../lib/types";

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

/**
 * Current and best consecutive-training-day streaks, walking backwards from
 * today across a bounded lookback window. A day with at least one workout
 * log counts toward the streak; a day the weeklyFocusPattern marks "rest"
 * neither breaks nor extends it (expected rest, not a miss). Any other
 * unlogged past day breaks the streak. Pure function over the log-date set
 * Progress already reads and UserProfile.weeklyFocusPattern - no
 * plan-vs-actual bookkeeping needed.
 */
export function computeStreak(
  loggedDates: Set<string>,
  pattern: TrainingPlanFocus[] | null,
  lookbackDays = 90
): { current: number; best: number } {
  const today = startOfDay(new Date());

  let best = 0;
  let running = 0;
  let current = 0;
  let stillCounting = true;

  // Walk backwards from today: `current` freezes at the first break
  // encountered (the streak trailing into today); `best` keeps scanning the
  // whole window for the longest run seen anywhere in it.
  for (let i = 0; i < lookbackDays; i++) {
    const d = addDays(today, -i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const isRestDay = pattern ? pattern[d.getDay()] === "rest" : false;

    if (loggedDates.has(key)) {
      running += 1;
      best = Math.max(best, running);
      if (stillCounting) current = running;
    } else if (isRestDay || i === 0) {
      // Rest-pattern days neither break nor extend. Today itself is treated
      // the same way while unlogged - "not yet reached", not a miss.
    } else {
      running = 0;
      stillCounting = false;
    }
  }

  return { current, best };
}
