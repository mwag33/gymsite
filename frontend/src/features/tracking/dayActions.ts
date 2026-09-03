// Firestore actions for the single date-keyed `daySessions` collection - the
// day-to-day mutation layer that replaced PlanDoc/Session/TrackedSession.
// Every mutation here is a plain client write (no Cloud Function): the
// firestore.rules `daySessions` block already permits owner create/update/
// delete directly, so changing a day's type, moving it, or editing its
// exercises never needs a server round-trip.
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type {
  DaySession,
  DraftDay,
  PlanExercise,
  TrackedExercise,
  TrackedExerciseStatus,
  TrainingPlanFocus,
} from "../../lib/types";
import { parseLocalDateKey } from "../plan/planDate";

/** The repeating default focus for a date with no daySessions doc yet - see
 * UserProfile.weeklyFocusPattern. Falls back to "other" (the ad hoc default)
 * before onboarding has generated a pattern. */
export function defaultFocusForDate(date: string, pattern: TrainingPlanFocus[] | null): TrainingPlanFocus {
  if (!pattern || pattern.length !== 7) return "other";
  return pattern[parseLocalDateKey(date).getDay()];
}

function dayRef(uid: string, date: string) {
  return doc(db, "users", uid, "daySessions", date);
}

/** "done" once every exercise is either skipped or resolved (a logged set, or
 * a no-machine category tap logged directly with no sets) - no explicit
 * "finish" action needed. Display-only: nothing server-side depends on it. */
export function computeDaySessionStatus(exercises: TrackedExercise[]): "in_progress" | "done" {
  if (exercises.length === 0) return "in_progress";
  return exercises.every((ex) => ex.status === "skipped" || ex.status === "logged") ? "done" : "in_progress";
}

/** Full-document create - only valid path the first time a date is touched
 * (see firestore.rules isValidNewDaySession, which requires every field). */
export async function createDaySession(
  uid: string,
  date: string,
  focus: TrainingPlanFocus,
  gymId: string | null,
  exercises: TrackedExercise[] = []
): Promise<void> {
  const data: Omit<DaySession, "date"> & { date: string } = {
    date,
    focus,
    gymId,
    exercises,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(dayRef(uid, date), data);
}

/** Merge-update path for a day that already has a doc - only ever touches
 * focus/exercises/updatedAt (see firestore.rules isValidDaySessionUpdate). */
async function updateDaySession(
  uid: string,
  date: string,
  patch: Partial<Pick<DaySession, "focus" | "exercises">>
): Promise<void> {
  await setDoc(dayRef(uid, date), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

/** Change a day's type. Creates the doc (with no exercises yet) if this is
 * the first edit on a previously pattern-only day. */
export async function setDayFocus(
  uid: string,
  date: string,
  focus: TrainingPlanFocus,
  gymId: string | null,
  exists: boolean
): Promise<void> {
  if (exists) {
    await updateDaySession(uid, date, { focus });
  } else {
    await createDaySession(uid, date, focus, gymId);
  }
}

export async function setDayExercises(
  uid: string,
  date: string,
  exercises: TrackedExercise[],
  focus: TrainingPlanFocus,
  gymId: string | null,
  exists: boolean
): Promise<void> {
  if (exists) {
    await updateDaySession(uid, date, { exercises });
  } else {
    await createDaySession(uid, date, focus, gymId, exercises);
  }
}

/** Deletes a day's doc outright - it reverts to showing the pattern default. */
export async function deleteDaySession(uid: string, date: string): Promise<void> {
  await deleteDoc(dayRef(uid, date));
}

/**
 * Moves a day's content (focus + exercises) onto another date, overwriting
 * whatever was there. The source date reverts to its pattern default (its
 * doc is deleted). Pure client-side delete-and-recreate - no Cloud Function.
 */
export async function moveDaySession(uid: string, sourceDate: string, targetDate: string): Promise<void> {
  const sourceSnap = await getDoc(dayRef(uid, sourceDate));
  if (!sourceSnap.exists()) return;
  const source = sourceSnap.data() as DaySession;
  await createDaySession(uid, targetDate, source.focus, source.gymId, source.exercises);
  await deleteDoc(dayRef(uid, sourceDate));
}

/**
 * Best-effort sync of exactly one newly-logged exercise into the append-only
 * `workoutLogs` collection, which the onWorkoutLogWritten trigger uses to
 * keep machineStats current. Fired once, the moment an exercise first
 * crosses into status "logged" (see useDaySession's updateExercises) - never
 * re-fired for a later edit to the same exercise's sets, so
 * machineStats.totalSessions doesn't inflate on every edit. Deleting an
 * exercise after it synced does not retract its machineStats entry.
 */
export async function syncLoggedExercise(uid: string, gymId: string | null, exercise: TrackedExercise): Promise<void> {
  try {
    const logsRef = collection(db, "users", uid, "workoutLogs");
    if (exercise.machineId) {
      await addDoc(logsRef, {
        mode: "detailed" as const,
        gymId: exercise.gymId ?? gymId,
        date: Timestamp.now(),
        exercises: [{ machineId: exercise.machineId, gymId: exercise.gymId ?? gymId ?? "", sets: exercise.sets }],
        createdAt: serverTimestamp(),
      });
    } else {
      await addDoc(logsRef, {
        mode: "simple" as const,
        gymId: null,
        date: Timestamp.now(),
        bodyParts: [exercise.machineCategory],
        createdAt: serverTimestamp(),
      });
    }
  } catch {
    // Best-effort: stats sync failing shouldn't block the UI.
  }
}

function planExerciseToTracked(ex: PlanExercise, status: TrackedExerciseStatus): TrackedExercise {
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
    status,
  };
}

/**
 * Materializes onboarding's reviewed draft week into real Firestore state:
 * a `daySessions` doc per reviewed day (carrying over any AI-suggested
 * exercises as "pending" targets) plus the derived UserProfile.weeklyFocusPattern
 * used for every week after. Called exactly once, when onboarding finishes.
 */
export async function materializeOnboardingWeek(
  uid: string,
  days: DraftDay[],
  gymId: string | null
): Promise<TrainingPlanFocus[]> {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  await Promise.all(
    sorted.map((day) =>
      createDaySession(
        uid,
        day.date,
        day.focus,
        gymId,
        (day.exercises ?? []).map((ex) => planExerciseToTracked(ex, "pending"))
      )
    )
  );

  const pattern: TrainingPlanFocus[] = new Array(7).fill("rest");
  for (const day of sorted) {
    pattern[parseLocalDateKey(day.date).getDay()] = day.focus;
  }
  await setDoc(doc(db, "users", uid), { weeklyFocusPattern: pattern }, { merge: true });
  return pattern;
}
