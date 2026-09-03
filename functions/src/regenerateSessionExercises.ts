import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { checkAndConsumeAiQuota, refundAiQuota } from "./quota";
import { generateExercisesForDays, geminiApiKey } from "./gemini";
import type { DraftDay, FeatureFlagsDoc, MachineCategory, MachineDoc, MuscleGroup, PlanExercise } from "./types";

interface RegenerateSessionExercisesRequest {
  dayId: string;
  focus: DraftDay["focus"];
  experience: string;
  sessionLengthMinutes: number;
  gymId: string | null;
  equipmentNotes?: string;
  injuryNotes?: string;
  preferences?: string;
}

/**
 * Onboarding-only: regenerates exercises for exactly one draft day, on
 * demand (e.g. right after the user swaps that day's focus during review).
 * Stateless, like generateExercisesForWeek - the client applies the
 * returned exercises to its local draft state itself.
 */
export const regenerateSessionExercises = onCall<RegenerateSessionExercisesRequest>(
  { secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to regenerate exercises.");
    }
    const uid = request.auth.uid;
    const input = request.data;

    if (!input?.dayId || typeof input.dayId !== "string") {
      throw new HttpsError("invalid-argument", "dayId is required.");
    }

    const flagsSnap = await db.doc("system/featureFlags").get();
    const flags = flagsSnap.data() as FeatureFlagsDoc | undefined;
    if (flags?.aiGenerationEnabled === false) {
      throw new HttpsError(
        "unavailable",
        "AI plan generation is temporarily paused. Please try again later."
      );
    }

    if (input.focus === "rest") {
      return { exercises: [] as PlanExercise[] };
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

    let exercises: PlanExercise[];
    try {
      const generated = await generateExercisesForDays({
        days: [{ dayIndex: 0, focus: input.focus }],
        experience: input.experience,
        sessionLengthMinutes: input.sessionLengthMinutes,
        gymMachines,
        userNotes,
      });
      const raw = generated.days.find((d) => d.dayIndex === 0)?.exercises ?? [];
      exercises = raw.map((ex, j) => ({
        id: `${input.dayId}-${j}`,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        targetMuscles: ex.targetMuscles as MuscleGroup[],
        machineCategory: input.focus as MachineCategory,
        note: ex.note,
      }));
    } catch (err) {
      await refundAiQuota(uid);
      throw err;
    }

    return { exercises };
  }
);
