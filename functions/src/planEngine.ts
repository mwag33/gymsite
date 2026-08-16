import { Timestamp } from "firebase-admin/firestore";
import { addDaysToDateKey, compareDateKeys } from "./dateUtils";
import type {
  MachineCategory,
  PlanDoc,
  Session,
  SessionStatus,
  TrainingPlanFocus,
} from "./types";

// ---------------------------------------------------------------------------
// Tunable constants. These encode the two product decisions called out in
// the plan doc (adherence is a 0.7 threshold, not a strict match; a miss is
// absorbed into the next rest day or dropped, never cascade-shifted) and are
// deliberately named/central here rather than scattered as magic numbers.
// ---------------------------------------------------------------------------

/**
 * Ratio of a detailed-mode session's planned exercise categories that must
 * be present in the log for the session to count as "done" rather than
 * "partial". See classifyLog() for the full threshold ladder.
 */
export const DONE_RATIO_THRESHOLD = 0.7;

/**
 * The protected window is expressed as a session count, not a day count:
 * every session through this many upcoming training-focus (non-"rest")
 * sessions is protected from the rebalancer and from AI schedule refreshes.
 */
export const PROTECTED_WINDOW_TRAINING_SESSION_COUNT = 2;

/** Sessions older than this many days (relative to "today") are dropped from
 * the plan doc's rolling window on each daily sweep. */
export const SESSION_RETENTION_DAYS = 14;

/** Trailing window used to recompute `missedCount` on each sweep. */
export const MISSED_COUNT_WINDOW_DAYS = 14;

/** `missedCount` at or above this threshold sets `needsScheduleRefresh`. */
export const MISSED_COUNT_REFRESH_THRESHOLD = 3;

const FOCUS_VALUES: TrainingPlanFocus[] = [
  "chest",
  "back",
  "legs",
  "core",
  "cardio",
  "upper_body",
  "rest",
];

function isFocusValue(value: string | undefined | null): value is TrainingPlanFocus {
  return !!value && (FOCUS_VALUES as string[]).includes(value);
}

// ---------------------------------------------------------------------------
// computeProtectedWindow
// ---------------------------------------------------------------------------

/**
 * Walks forward from `todayKey` and returns every session (training and rest
 * alike) through the 2nd upcoming training-focus session, inclusive. This is
 * the single definition of "protected" shared by the rebalancer (which must
 * never repurpose a protected rest day) and the AI schedule refresh (which
 * must pass these sessions as fixed constraints rather than gaps to fill).
 *
 * Sessions are expected sorted by date, but this defensively sorts anyway
 * since callers may pass an unsorted slice.
 */
export function computeProtectedWindow(sessions: Session[], todayKey: string): Session[] {
  const upcoming = sessions
    .filter((s) => s.date >= todayKey)
    .slice()
    .sort((a, b) => compareDateKeys(a.date, b.date));

  const protectedSessions: Session[] = [];
  let trainingFocusSeen = 0;
  for (const session of upcoming) {
    protectedSessions.push(session);
    if (session.focus !== "rest") {
      trainingFocusSeen++;
      if (trainingFocusSeen >= PROTECTED_WINDOW_TRAINING_SESSION_COUNT) {
        break;
      }
    }
  }
  return protectedSessions;
}

// ---------------------------------------------------------------------------
// rebalancePlan
// ---------------------------------------------------------------------------

/**
 * Absorbs a missed/swapped session into the next available rest day beyond
 * the protected window, or drops it if no rest day exists (decision 1 in the
 * plan doc: dates never cascade-shift). Idempotent: if `missed.id` has
 * already been stamped as the source of a reschedule elsewhere in `sessions`,
 * this is a no-op, so a redelivered trigger or a re-run sweep can't
 * double-reschedule the same miss.
 */
export function rebalancePlan(sessions: Session[], missed: Session, todayKey: string): Session[] {
  if (sessions.some((s) => s.rescheduledFromSessionId === missed.id)) {
    return sessions;
  }

  const protectedIds = new Set(computeProtectedWindow(sessions, todayKey).map((s) => s.id));

  const candidate = sessions
    .filter(
      (s) =>
        s.status === "upcoming" &&
        s.focus === "rest" &&
        !s.locked &&
        !protectedIds.has(s.id) &&
        // Must be a future rest day, not merely later than the miss: if the
        // miss itself is several days stale (e.g. the first sweep after
        // downtime), a rest day between the miss and today would otherwise
        // qualify and get "rescheduled" into the past. protectedIds already
        // excludes the near-future window, so this is the full "future,
        // beyond the protected window" condition.
        s.date >= todayKey
    )
    .sort((a, b) => compareDateKeys(a.date, b.date))[0];

  if (!candidate) {
    // No rest day available past the protected window - the miss is simply
    // dropped, not cascade-shifted. The session stays skipped/swapped.
    return sessions;
  }

  return sessions.map((s) =>
    s.id === candidate.id
      ? {
          ...s,
          focus: missed.focus,
          // Overwrite the rest day's note with the reschedule reason, not the
          // missed session's own coaching note - this is what AdjustmentBanner
          // (frontend/src/features/plan/AdjustmentBanner.tsx) renders verbatim.
          note: `Rescheduled from ${missed.date} (you ${missed.status === "swapped" ? "logged something different that day" : "missed that session"}).`,
          exercises: missed.exercises,
          status: "upcoming" as SessionStatus,
          locked: false,
          source: "deterministic_reschedule" as const,
          rescheduledFromSessionId: missed.id,
          swappedFocus: null,
        }
      : s
  );
}

// ---------------------------------------------------------------------------
// resolveSessionForLog
// ---------------------------------------------------------------------------

export interface LogClassificationInput {
  plannedSessionId: string | null;
  mode: "simple" | "detailed";
  /** Deduped MachineCategory values present in what was actually logged,
   * already resolved by the caller (machine lookups happen outside this
   * pure module so it stays trivially unit-testable against fixtures). */
  loggedCategories: MachineCategory[];
}

export interface ResolveSessionForLogResult {
  changed: boolean;
  sessions: Session[];
}

/**
 * Classifies a single logged workout against its planned session.
 *
 * Matching happens at the machine-category level, not exact exercise
 * identity: `PlanExercise` carries no machineId (it's an AI-suggested name,
 * not necessarily a catalog entry), so category is the only reliable common
 * key between a planned exercise and a logged one. Under the current
 * exercise-generation prompt every exercise in a session shares one category
 * (the session's focus), so in practice the detailed-mode ratio below is 0 or
 * 1 today; the ratio math is still written generically so a future
 * exercise-generation change that mixes categories within one session (e.g.
 * a composite "upper_body" day) is classified correctly without touching
 * this function.
 */
function classifyLog(
  session: Session,
  mode: "simple" | "detailed",
  loggedCategories: MachineCategory[]
): { status: SessionStatus; swappedFocus: TrainingPlanFocus | null } {
  // MachineCategory and TrainingPlanFocus overlap but neither is a subtype
  // of the other (MachineCategory adds "other", TrainingPlanFocus adds
  // "rest"), so this maps element-wise to `TrainingPlanFocus | null` before
  // searching, rather than trying to type-guard directly on MachineCategory.
  const dominantLoggedFocus =
    loggedCategories
      .map((c): TrainingPlanFocus | null => (isFocusValue(c) ? c : null))
      .find((f): f is TrainingPlanFocus => f !== null) ?? null;

  if (session.focus === "rest") {
    // Nothing was planned here - any log against a rest-day session is an
    // unplanned swap by definition.
    return { status: "swapped", swappedFocus: dominantLoggedFocus };
  }

  const plannedCategories: MachineCategory[] =
    session.exercises && session.exercises.length > 0
      ? Array.from(new Set(session.exercises.map((e) => e.machineCategory)))
      : [session.focus as MachineCategory];

  if (mode === "simple") {
    // Binary: does the logged category overlap the planned focus at all?
    const matched = loggedCategories.some((c) => plannedCategories.includes(c));
    return matched
      ? { status: "done", swappedFocus: null }
      : { status: "swapped", swappedFocus: dominantLoggedFocus };
  }

  // Detailed mode: ratio of planned categories present in the log.
  const matchedCategories = plannedCategories.filter((c) => loggedCategories.includes(c));
  const ratio = plannedCategories.length > 0 ? matchedCategories.length / plannedCategories.length : 0;

  if (ratio >= DONE_RATIO_THRESHOLD) {
    return { status: "done", swappedFocus: null };
  }
  if (ratio > 0) {
    return { status: "partial", swappedFocus: null };
  }
  if (loggedCategories.length === 0) {
    // No resolvable category evidence at all (e.g. logged machines with no
    // catalog match) - treat as ambiguous rather than penalizing as a full
    // swap; the log did happen, we just can't confirm what against.
    return { status: "partial", swappedFocus: null };
  }
  return { status: "swapped", swappedFocus: dominantLoggedFocus };
}

/**
 * Resolves adherence for a single logged workout against the plan doc,
 * idempotently, and triggers rebalancePlan() when the outcome is a miss.
 * Pure function: the caller (onWorkoutLogWritten.ts) owns the Firestore
 * transaction and passes in already-resolved logged categories.
 */
export function resolveSessionForLog(
  plan: PlanDoc,
  input: LogClassificationInput,
  todayKey: string
): ResolveSessionForLogResult {
  if (!input.plannedSessionId) {
    return { changed: false, sessions: plan.sessions };
  }

  const idx = plan.sessions.findIndex((s) => s.id === input.plannedSessionId);
  if (idx === -1) {
    // Session rolled off the window or never existed - nothing to resolve.
    return { changed: false, sessions: plan.sessions };
  }

  const session = plan.sessions[idx];
  if (session.status !== "upcoming") {
    // Idempotency guard: at-least-once trigger delivery must not re-resolve
    // (and potentially re-rebalance) an already-resolved session.
    return { changed: false, sessions: plan.sessions };
  }

  const { status, swappedFocus } = classifyLog(session, input.mode, input.loggedCategories);

  let sessions = plan.sessions.map((s, i) =>
    i === idx ? { ...s, status, swappedFocus, loggedAt: Timestamp.now() } : s
  );

  if (status === "skipped" || status === "swapped") {
    sessions = rebalancePlan(sessions, sessions[idx], todayKey);
  }

  return { changed: true, sessions };
}

// ---------------------------------------------------------------------------
// runDailySweep
// ---------------------------------------------------------------------------

/**
 * Pure transform of a plan doc for one elapsed local calendar day: marks
 * past-due `upcoming` sessions `skipped` and rebalances each, rolls the
 * rolling window (drops sessions older than SESSION_RETENTION_DAYS), and
 * recomputes the trailing missedCount/`needsScheduleRefresh` flag. The
 * caller (planDailySweep.ts) owns the Firestore transaction, the per-user
 * timezone resolution, and the "has the local date actually advanced since
 * lastSweepAt" gate.
 */
export function runDailySweep(plan: PlanDoc, todayKey: string): PlanDoc {
  let sessions = plan.sessions.slice();

  // Rest days are never logged, so an untouched rest day would otherwise sit
  // "upcoming" forever and get swept into "skipped" every day past its date -
  // which is not a miss (nothing was planned to happen) and must not feed
  // missedCount or consume a rebalance slot. Only past-due *training* days
  // are misses; past-due rest days are simply marked "done" (nothing was
  // required, and it keeps the invariant that nothing in the past stays
  // "upcoming" indefinitely) without ever calling rebalancePlan.
  const pastDueTrainingIds = sessions
    .filter((s) => s.status === "upcoming" && s.date < todayKey && s.focus !== "rest")
    .map((s) => s.id);
  const pastDueRestIds = sessions
    .filter((s) => s.status === "upcoming" && s.date < todayKey && s.focus === "rest")
    .map((s) => s.id);

  sessions = sessions.map((s) =>
    pastDueRestIds.includes(s.id) ? { ...s, status: "done" as SessionStatus } : s
  );

  for (const id of pastDueTrainingIds) {
    sessions = sessions.map((s) => (s.id === id ? { ...s, status: "skipped" as SessionStatus } : s));
    const missed = sessions.find((s) => s.id === id);
    if (missed) {
      sessions = rebalancePlan(sessions, missed, todayKey);
    }
  }

  const retentionCutoff = addDaysToDateKey(todayKey, -SESSION_RETENTION_DAYS);
  sessions = sessions.filter((s) => s.date >= retentionCutoff);

  const missedWindowStart = addDaysToDateKey(todayKey, -MISSED_COUNT_WINDOW_DAYS);
  const missedCount = sessions.filter(
    (s) => s.date >= missedWindowStart && s.date < todayKey && (s.status === "skipped" || s.status === "swapped")
  ).length;

  sessions.sort((a, b) => compareDateKeys(a.date, b.date));

  return {
    ...plan,
    sessions,
    needsScheduleRefresh: plan.needsScheduleRefresh || missedCount >= MISSED_COUNT_REFRESH_THRESHOLD,
    lastSweepAt: Timestamp.now(),
  };
}

// ---------------------------------------------------------------------------
// computeExerciseHorizon
// ---------------------------------------------------------------------------

/**
 * Not one of the four functions named in the plan doc, but shared
 * deterministic logic used by generateSchedule.ts, generateExercisesForWeek.ts
 * and regeneratePlan.ts alike, so it lives here rather than being
 * duplicated. Walks forward from `todayKey` and returns the last date
 * through which every training-focus session has non-null exercises,
 * contiguously - i.e. "sessions on/before this date have exercises filled"
 * per the PlanDoc.exerciseHorizon contract. Rest days (`exercises: []` by
 * design, never pending generation) don't block the walk; the first
 * training day with `exercises === null` stops it.
 */
export function computeExerciseHorizon(sessions: Session[], todayKey: string): string {
  const upcoming = sessions
    .filter((s) => s.date >= todayKey)
    .slice()
    .sort((a, b) => compareDateKeys(a.date, b.date));

  let horizon = todayKey;
  for (const s of upcoming) {
    if (s.focus === "rest") {
      horizon = s.date;
      continue;
    }
    if (s.exercises !== null) {
      horizon = s.date;
      continue;
    }
    break;
  }
  return horizon;
}
