import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { checkAndConsumeAiQuota, refundAiQuota } from "./quota";
import { generateExercisesForDays, geminiApiKey } from "./gemini";
import type { DraftDay, FeatureFlagsDoc, MachineCategory, MachineDoc, MuscleGroup, PlanExercise } from "./types";

interface GenerateExercisesForWeekRequest {
  days: { id: string; focus: DraftDay["focus"] }[];
  experience: string;
  sessionLengthMinutes: number;
  gymId: string | null;
  equipmentNotes?: string;
  injuryNotes?: string;
  preferences?: string;
}

/**
 * Onboarding-only, one-time call: proposes specific exercises for the
 * client-supplied draft week (the days generateSchedule produced, with any
 * focus edits the user made during review already applied). Stateless - no
 * Firestore plan doc to read or write; the client holds the draft and
 * materializes it into real `daySessions` docs itself once onboarding
 * finishes. This AI call never runs again after onboarding - every
 * suggestion after that is history-based (see
 * frontend/src/features/tracking/recommendedExercises.ts).
 */
export const generateExercisesForWeek = onCall<GenerateExercisesForWeekRequest>(
  { secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to generate exercises.");
    }
    const uid = request.auth.uid;
    const input = request.data;

    if (!Array.isArray(input?.days) || input.days.length === 0) {
      throw new HttpsError("invalid-argument", "days is required.");
    }

    const flagsSnap = await db.doc("system/featureFlags").get();
    const flags = flagsSnap.data() as FeatureFlagsDoc | undefined;
    if (flags?.aiGenerationEnabled === false) {
      throw new HttpsError(
        "unavailable",
        "AI plan generation is temporarily paused. Please try again later."
      );
    }

    const trainingDays = input.days.filter((d) => d.focus !== "rest");
    if (trainingDays.length === 0) {
      return { exercisesById: {} };
    }

    await checkAndConsumeAiQuota(uid);

    let gymMachines: { name: string; category: string }[] = [];
    if (input.gymId) {
      const machinesSnap = await db
        .collection(`gyms/${input.gymId}/machines`)
        .where("archived", "==", false)
        .get();
      gymMachines = machinesSnap.docs.map((d) => {
        const m = d.data() as MachineDoc;
        return { name: m.name, category: m.category };
      });
    }

    const userNotes = [
      input.equipmentNotes && `equipment: ${input.equipmentNotes}`,
      input.injuryNotes && `injuries/limitations: ${input.injuryNotes}`,
      input.preferences && `preferences: ${input.preferences}`,
    ]
      .filter(Boolean)
      .join("\n");

    let exercisesById: Record<string, PlanExercise[]>;
    try {
      const generated = await generateExercisesForDays({
        days: trainingDays.map((d, i) => ({ dayIndex: i, focus: d.focus })),
        experience: input.experience,
        sessionLengthMinutes: input.sessionLengthMinutes,
        gymMachines,
        userNotes,
      });
      const exercisesByIndex = new Map(generated.days.map((d) => [d.dayIndex, d.exercises]));
      exercisesById = {};
      trainingDays.forEach((d, i) => {
        const raw = exercisesByIndex.get(i) ?? [];
        exercisesById[d.id] = raw.map((ex, j) => ({
          id: `${d.id}-${j}`,
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          targetMuscles: ex.targetMuscles as MuscleGroup[],
          machineCategory: d.focus as MachineCategory,
          note: ex.note,
        }));
      });
    } catch (err) {
      await refundAiQuota(uid);
      throw err;
    }

    return { exercisesById };
  }
);
