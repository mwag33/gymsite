import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { checkAndConsumeAiQuota, refundAiQuota } from "./quota";
import { generateExercisesForDays, geminiApiKey, MODEL_ID } from "./gemini";
import type {
  FeatureFlagsDoc,
  MachineDoc,
  MuscleGroup,
  TrainingPlanDay,
  TrainingPlanDoc,
  TrainingPlanFocus,
} from "./types";

interface GenerateExercisesForPlanRequest {
  days: { dayIndex: number; focus: TrainingPlanFocus; note: string }[];
  experience: string;
  sessionLengthMinutes: number;
  gymId: string | null;
  equipmentNotes?: string;
  injuryNotes?: string;
  preferences?: string;
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

export const generateExercisesForPlan = onCall<GenerateExercisesForPlanRequest>(
  { secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to generate exercises.");
    }
    const uid = request.auth.uid;
    const input = request.data;

    if (!Array.isArray(input.days) || input.days.length !== 7) {
      throw new HttpsError("invalid-argument", "days must contain exactly 7 entries.");
    }

    const flagsSnap = await db.doc("system/featureFlags").get();
    const flags = flagsSnap.data() as FeatureFlagsDoc | undefined;
    if (flags?.aiGenerationEnabled === false) {
      throw new HttpsError(
        "unavailable",
        "AI plan generation is temporarily paused. Please try again later."
      );
    }

    await checkAndConsumeAiQuota(uid);

    const trainingDays = input.days.filter((d) => d.focus !== "rest");

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

    // Same reason as generateInitialPlan: refund the reserved unit if the
    // call never produced exercises, so a Gemini-side failure doesn't
    // permanently cost the user a slot of their daily cap.
    let generated;
    try {
      generated = await generateExercisesForDays({
        days: trainingDays.map((d) => ({ dayIndex: d.dayIndex, focus: d.focus })),
        experience: input.experience,
        sessionLengthMinutes: input.sessionLengthMinutes,
        gymMachines,
        userNotes,
      });
    } catch (err) {
      await refundAiQuota(uid);
      throw err;
    }

    const exercisesByDayIndex = new Map(generated.days.map((d) => [d.dayIndex, d.exercises]));

    const days: TrainingPlanDay[] = input.days.map((day) => ({
      dayIndex: day.dayIndex,
      focus: day.focus,
      note: day.note,
      exercises: (exercisesByDayIndex.get(day.dayIndex) ?? []).map((ex, i) => ({
        id: `${day.dayIndex}-${i}`,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        targetMuscles: ex.targetMuscles as MuscleGroup[],
        machineCategory: day.focus === "rest" ? "other" : day.focus,
        note: ex.note,
      })),
    }));

    const now = Timestamp.now();
    const weekStartsOn = input.weekStartsOn ?? 1;
    const weekStart = Timestamp.fromDate(startOfWeek(now.toDate(), weekStartsOn));
    const frequencyPerWeek = trainingDays.length;

    const plan: TrainingPlanDoc = {
      generatedAt: now,
      basedOnLogId: null,
      weekStart,
      frequencyPerWeek,
      days,
      modelVersion: MODEL_ID,
      exercisesGeneratedAt: now,
      exercisesLocked: false,
      editedAt: null,
    };

    await db.doc(`users/${uid}/trainingPlans/current`).set(plan);

    return plan;
  }
);
