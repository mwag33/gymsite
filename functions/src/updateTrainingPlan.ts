import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { MUSCLE_GROUP_ENUM } from "./gemini";
import type { TrainingPlanDay } from "./types";

interface UpdateTrainingPlanRequest {
  days: TrainingPlanDay[];
}

const FOCUS_VALUES = ["chest", "back", "legs", "core", "cardio", "upper_body", "rest"];
const CATEGORY_VALUES = ["chest", "back", "legs", "core", "cardio", "upper_body", "other"];
const MUSCLE_VALUES = new Set(MUSCLE_GROUP_ENUM);

function isValidExercise(ex: unknown): boolean {
  if (!ex || typeof ex !== "object") return false;
  const e = ex as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.name === "string" &&
    e.name.length > 0 &&
    e.name.length <= 80 &&
    Number.isInteger(e.sets) &&
    (e.sets as number) >= 1 &&
    (e.sets as number) <= 10 &&
    typeof e.reps === "string" &&
    e.reps.length <= 20 &&
    Array.isArray(e.targetMuscles) &&
    e.targetMuscles.every((m) => typeof m === "string" && MUSCLE_VALUES.has(m)) &&
    typeof e.machineCategory === "string" &&
    CATEGORY_VALUES.includes(e.machineCategory) &&
    (e.note === undefined || typeof e.note === "string")
  );
}

function isValidDay(day: unknown): day is TrainingPlanDay {
  if (!day || typeof day !== "object") return false;
  const d = day as Record<string, unknown>;
  return (
    Number.isInteger(d.dayIndex) &&
    (d.dayIndex as number) >= 0 &&
    (d.dayIndex as number) <= 6 &&
    typeof d.focus === "string" &&
    FOCUS_VALUES.includes(d.focus) &&
    typeof d.note === "string" &&
    Array.isArray(d.exercises) &&
    d.exercises.every(isValidExercise)
  );
}

// The only client-driven write path to `trainingPlans/current` (which is
// otherwise `allow write: if false` in firestore.rules - see the comment
// there). Validates the whole edited plan server-side rather than loosening
// the rule to a client-writable schema, matching updateUserSettings.ts's
// pattern of validating callable input instead of trusting client writes.
export const updateTrainingPlan = onCall<UpdateTrainingPlanRequest>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to edit your plan.");
  }
  const uid = request.auth.uid;
  const days = request.data?.days;

  if (!Array.isArray(days) || days.length !== 7) {
    throw new HttpsError("invalid-argument", "days must contain exactly 7 entries.");
  }
  if (!days.every(isValidDay)) {
    throw new HttpsError("invalid-argument", "One or more days failed validation.");
  }
  const dayIndexes = new Set(days.map((d) => d.dayIndex));
  if (dayIndexes.size !== 7) {
    throw new HttpsError("invalid-argument", "days must cover each dayIndex 0-6 exactly once.");
  }

  const planRef = db.doc(`users/${uid}/trainingPlans/current`);
  const snap = await planRef.get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "No training plan exists to edit yet.");
  }

  const now = Timestamp.now();
  await planRef.update({ days, exercisesLocked: true, editedAt: now });

  return { success: true };
});
