// Creation and lifecycle actions for TrackedSession, the client-owned,
// mutable record of what a user is actually doing (see lib/types.ts and
// firestore.rules for the data model + the append-only-tradeoff rationale).
import { addDoc, collection, doc, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { ExerciseEntry, MachineCategory, PlanExercise, Session, TrackedExercise, TrackedSession, TrackedSessionStatus } from "../../lib/types";

function planExerciseToTracked(ex: PlanExercise): TrackedExercise {
  return {
    id: ex.id,
    name: ex.name,
    machineId: null,
    gymId: null,
    machineCategory: ex.machineCategory,
    targetSets: ex.sets,
    targetReps: ex.reps,
    targetMuscles: ex.targetMuscles,
    sets: [],
    status: "pending",
  };
}

/**
 * Turns a PlanDoc suggestion into a real, trackable session. Nothing is
 * written back to PlanDoc here - its session only changes status later,
 * automatically, once syncWorkoutLog below fires the first sync event
 * (see functions/src/onWorkoutLogWritten.ts, untouched by this refactor).
 */
export async function acceptPlanSession(
  uid: string,
  planSession: Session,
  gymId: string | null
): Promise<string> {
  const ref = doc(collection(db, "users", uid, "trackedSessions"));
  const session: Omit<TrackedSession, "id"> = {
    date: planSession.date,
    focus: planSession.focus,
    note: planSession.note,
    gymId,
    exercises: (planSession.exercises ?? []).map(planExerciseToTracked),
    status: "in_progress",
    sourcePlanSessionId: planSession.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastSyncedLogAt: null,
  };
  await setDoc(ref, session);
  return ref.id;
}

/** A purely user-created session: backdated logging, or logging on a day with no (or an already-accepted) plan suggestion. */
export async function createAdHocTrackedSession(
  uid: string,
  date: string,
  gymId: string | null,
  focus: TrackedSession["focus"] = "other"
): Promise<string> {
  const ref = doc(collection(db, "users", uid, "trackedSessions"));
  const session: Omit<TrackedSession, "id"> = {
    date,
    focus,
    note: "",
    gymId,
    exercises: [],
    status: "in_progress",
    sourcePlanSessionId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastSyncedLogAt: null,
  };
  await setDoc(ref, session);
  return ref.id;
}

/** "done" once every exercise is either skipped or resolved (a logged set, or
 * a no-machine category tap logged directly with no sets - see the gymId ===
 * null path in SessionTrackerPage) - no explicit "finish" action needed. */
export function computeTrackedSessionStatus(exercises: TrackedExercise[]): TrackedSessionStatus {
  if (exercises.length === 0) return "in_progress";
  const allResolved = exercises.every((ex) => ex.status === "skipped" || ex.status === "logged");
  return allResolved ? "done" : "in_progress";
}

function toExerciseEntries(session: Pick<TrackedSession, "gymId" | "exercises">): ExerciseEntry[] {
  return session.exercises
    .filter((ex) => ex.machineId && ex.sets.length > 0)
    .map((ex) => ({ machineId: ex.machineId!, gymId: ex.gymId ?? session.gymId ?? "", sets: ex.sets }));
}

/**
 * The invisible replacement for the old "Finish session" button: fires a
 * same-shape workoutLogs write so the untouched Cloud Functions trigger
 * (adherence marking/rebalancing + machineStats aggregation + the daily
 * sweep's upcoming/skipped resolution) keeps working exactly as before.
 * Called from useAutosaveTrackedSession on unmount, not per keystroke.
 *
 * `gymId === null` sessions (no active gym - see SessionTrackerPage's
 * category-chip fallback) have no machine to look up, so they sync as a
 * `mode: "simple"` log carrying the distinct logged categories directly,
 * same shape the old SimpleLogView used to write.
 */
export async function syncWorkoutLog(uid: string, session: TrackedSession): Promise<void> {
  if (session.gymId === null) {
    const bodyParts = Array.from(
      new Set(
        session.exercises.filter((ex) => ex.status === "logged").map((ex) => ex.machineCategory)
      )
    ) as MachineCategory[];
    if (bodyParts.length === 0) return;
    await addDoc(collection(db, "users", uid, "workoutLogs"), {
      mode: "simple" as const,
      gymId: null,
      date: Timestamp.now(),
      bodyParts,
      createdAt: serverTimestamp(),
      plannedSessionId: session.sourcePlanSessionId,
    });
    await updateDoc(doc(db, "users", uid, "trackedSessions", session.id), {
      lastSyncedLogAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const entries = toExerciseEntries(session);
  if (entries.length === 0) return;
  await addDoc(collection(db, "users", uid, "workoutLogs"), {
    mode: "detailed" as const,
    gymId: session.gymId,
    date: Timestamp.now(),
    exercises: entries,
    createdAt: serverTimestamp(),
    plannedSessionId: session.sourcePlanSessionId,
  });
  await updateDoc(doc(db, "users", uid, "trackedSessions", session.id), {
    lastSyncedLogAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
