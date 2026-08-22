// Merges the two session sources that now coexist for any given date: the
// AI-generated suggestion feed (PlanDoc.sessions[], still one-per-day) and
// the user-owned, possibly-multiple-per-day trackedSessions collection. See
// the "additive, not a replacement" decision in the project plan — a plan
// session is never mutated directly; it becomes "accepted" once a tracked
// session references it via sourcePlanSessionId.
import type { Session, TrackedSession } from "../../lib/types";

export interface DaySessionView {
  date: string;
  tracked: TrackedSession[];
  unacceptedSuggestion: Session | null;
}

export function mergeDaySessions(
  planSessions: Session[],
  trackedSessions: TrackedSession[],
  date: string
): DaySessionView {
  const tracked = trackedSessions.filter((t) => t.date === date);
  const acceptedPlanIds = new Set(
    tracked.map((t) => t.sourcePlanSessionId).filter((id): id is string => id !== null)
  );
  const planSession = planSessions.find((s) => s.date === date) ?? null;
  return {
    date,
    tracked,
    unacceptedSuggestion: planSession && !acceptedPlanIds.has(planSession.id) ? planSession : null,
  };
}

/** Single most-representative status for a day, for compact glyphs (e.g. MonthAgenda cells). */
export function summarizeDayStatus(view: DaySessionView): TrackedSession["status"] | Session["status"] | null {
  if (view.tracked.length > 0) {
    return view.tracked.some((t) => t.status === "done") ? "done" : "in_progress";
  }
  return view.unacceptedSuggestion?.status ?? null;
}
