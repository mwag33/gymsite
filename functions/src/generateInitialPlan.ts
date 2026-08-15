import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { checkAndConsumeAiQuota, refundAiQuota } from "./quota";
import { generateTrainingPlan, geminiApiKey, MODEL_ID } from "./gemini";
import type { FeatureFlagsDoc, TrainingPlanDoc, UserSettings } from "./types";

interface GenerateInitialPlanRequest {
  goal: string;
  experience: string;
  daysPerWeek: number;
  sessionLengthMinutes: number;
  gymId: string | null;
  equipmentNotes?: string;
  injuryNotes?: string;
  preferences?: string;
  units?: "metric" | "imperial";
  weekStartsOn?: number;
}

function startOfWeek(date: Date, weekStartsOn: number): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const generateInitialPlan = onCall<GenerateInitialPlanRequest>(
  { secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to generate a plan.");
    }
    const uid = request.auth.uid;
    const input = request.data;

    const flagsSnap = await db.doc("system/featureFlags").get();
    const flags = flagsSnap.data() as FeatureFlagsDoc | undefined;
    if (flags?.aiGenerationEnabled === false) {
      throw new HttpsError(
        "unavailable",
        "AI plan generation is temporarily paused. Please try again later."
      );
    }

    await checkAndConsumeAiQuota(uid);

    const userNotes = [
      input.equipmentNotes && `equipment: ${input.equipmentNotes}`,
      input.injuryNotes && `injuries/limitations: ${input.injuryNotes}`,
      input.preferences && `preferences: ${input.preferences}`,
    ]
      .filter(Boolean)
      .join("\n");

    // The quota unit above is reserved before calling Gemini so an
    // over-quota user can't keep triggering billed API calls at all - but
    // that means a failure that never produced a plan (a bad model name, a
    // transient Gemini error) must refund the unit, or a bug on our side
    // permanently eats into the user's daily cap for no fault of their own.
    let generated;
    try {
      generated = await generateTrainingPlan({
        goal: input.goal,
        experience: input.experience,
        daysPerWeek: input.daysPerWeek,
        sessionLengthMinutes: input.sessionLengthMinutes,
        recentWorkoutSummary: "No prior workout history yet - this is the user's first plan.",
        userNotes,
        basedOnLogId: null,
      });
    } catch (err) {
      await refundAiQuota(uid);
      throw err;
    }

    const now = Timestamp.now();
    const weekStartsOn = input.weekStartsOn ?? 1;
    const weekStart = Timestamp.fromDate(startOfWeek(now.toDate(), weekStartsOn));

    const plan: TrainingPlanDoc = {
      generatedAt: now,
      basedOnLogId: null,
      weekStart,
      frequencyPerWeek: input.daysPerWeek,
      // Exercises are proposed in a separate step (generateExercisesForPlan)
      // once the user has reviewed/adjusted this schedule - this is a draft.
      days: generated.days.map((day) => ({ ...day, exercises: [] })),
      modelVersion: MODEL_ID,
      exercisesGeneratedAt: null,
      exercisesLocked: false,
      editedAt: null,
    };

    // Partial on purpose: merged with `{merge: true}` below, so fields not
    // touched here (e.g. activeGymId, logModeDefault) keep whatever
    // onUserCreate already set rather than being wiped back to undefined.
    const settings: Partial<UserSettings> = {
      units: input.units ?? "metric",
      weekStartsOn,
    };

    const userUpdate: Record<string, unknown> = {
      goal: input.goal,
      goalUpdatedAt: now,
      settings,
    };
    if (input.gymId) {
      userUpdate.homeGymIds = FieldValue.arrayUnion(input.gymId);
    }

    await db.doc(`users/${uid}/trainingPlans/current`).set(plan);
    await db.doc(`users/${uid}`).set(userUpdate, { merge: true });

    return plan;
  }
);
