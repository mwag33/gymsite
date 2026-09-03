// Calendar data layer: subscribes to every `daySessions` doc whose date
// (the doc ID) falls in [startDate, endDate], keyed by date - the direct
// replacement for the old PlanDoc.sessions + trackedSessions merge. A date
// with no doc in the map simply has no override yet; callers fall back to
// UserProfile.weeklyFocusPattern (see dayViewFor below).
import { useEffect, useState } from "react";
import { collection, documentId, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { DaySession, MachineCategory, TrainingPlanFocus } from "../../lib/types";
import { computeDaySessionStatus, defaultFocusForDate } from "../tracking/dayActions";
import { deriveLoggedCategories } from "./deriveFocus";

export function useDaySessionsRange(
  uid: string | undefined,
  startDate: string,
  endDate: string
): Record<string, DaySession> {
  const [byDate, setByDate] = useState<Record<string, DaySession>>({});

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(
        collection(db, "users", uid, "daySessions"),
        where(documentId(), ">=", startDate),
        where(documentId(), "<=", endDate)
      ),
      (snap) => {
        const next: Record<string, DaySession> = {};
        for (const d of snap.docs) next[d.id] = d.data() as DaySession;
        setByDate(next);
      }
    );
  }, [uid, startDate, endDate]);

  return byDate;
}

export interface DayView {
  date: string;
  focus: TrainingPlanFocus;
  isOverride: boolean;
  /** "Actual overrides planned": what was actually logged, once anything's
   * logged, else the day's focus. Null for a rest/other day with nothing done. */
  displayCategory: MachineCategory | null;
  status: "empty" | "in_progress" | "done";
}

export function dayViewFor(
  date: string,
  session: DaySession | undefined,
  pattern: TrainingPlanFocus[] | null
): DayView {
  if (!session) {
    const focus = defaultFocusForDate(date, pattern);
    return { date, focus, isOverride: false, displayCategory: focus === "rest" || focus === "other" ? null : focus, status: "empty" };
  }
  const [loggedFirst] = deriveLoggedCategories(session.exercises);
  const displayCategory =
    loggedFirst ?? (session.focus === "rest" || session.focus === "other" ? null : session.focus);
  const status = session.exercises.length === 0 ? "empty" : computeDaySessionStatus(session.exercises);
  return { date, focus: session.focus, isOverride: true, displayCategory, status };
}
