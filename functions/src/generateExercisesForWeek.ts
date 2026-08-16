import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { checkAndConsumeAiQuota, refundAiQuota } from "./quota";
import { generateExercisesForDays, geminiApiKey, MODEL_ID } from "./gemini";
import { addDaysToDateKey, compareDateKeys, localDateKey } from "./dateUtils";
import { computeExerciseHorizon } from "./planEngine";
import type {
  FeatureFlagsDoc,
  MachineCategory,
  MachineDoc,
  MuscleGroup,
  PlanDoc,
  PlanExercise,
  Session,
} from "./types";

interface GenerateExercisesForWeekRequest {
  experience: string;
  sessionLengthMinutes: number;
  gymId: string | null;
  equipmentNotes?: string;
  injuryNotes?: string;
  preferences?: string;
}

const FILL_WINDOW_DAYS = 7;

export interface RunExerciseFillParams {
  /** Training-focus sessions to fill, already scoped by the caller (unlocked,
   * in-window, currently unfilled or intentionally being regenerated). */
  sessions: Session[];
  experience: string;
  sessionLengthMinutes: number;
  gymMachines: { name: string; category: string }[];
  userNotes: string;
}

/**
 * Core exercise-fill logic, shared by the `generateExercisesForWeek`
 * callable (below) and regeneratePlan.ts's near-term re-fill step. Reuses
 * the unchanged generateExercisesForDays schema/prompt from gemini.ts - it
 * already operates correctly on a day-subset with fixed focuses, so nothing
 * about the Gemini call itself changes, only how the day-subset is chosen.
 */
export async function runExerciseFill(
  params: RunExerciseFillParams
): Promise<Map<string, PlanExercise[]>> {
  if (params.sessions.length === 0) {
    return new Map();
  }

  const generated = await generateExercisesForDays({
    days: params.sessions.map((s, i) => ({ dayIndex: i, focus: s.focus })),
    experience: params.experience,
    sessionLengthMinutes: params.sessionLengthMinutes,
    gymMachines: params.gymMachines,
    userNotes: params.userNotes,
  });
  const exercisesByIndex = new Map(generated.days.map((d) => [d.dayIndex, d.exercises]));

  const result = new Map<string, PlanExercise[]>();
  params.sessions.forEach((s, i) => {
    const raw = exercisesByIndex.get(i) ?? [];
    result.set(
      s.id,
      raw.map((ex, j) => ({
        id: `${s.id}-${j}`,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        targetMuscles: ex.targetMuscles as MuscleGroup[],
        machineCategory: s.focus === "rest" ? "other" : (s.focus as MachineCategory),
        note: ex.note,
      }))
    );
  });
  return result;
}

/**
 * Fills the next unfilled ~7-day slice of exercises starting at the plan's
 * `exerciseHorizon` and advances it. No client-supplied `days` array - the
 * server reads `plans/current` itself, so a stale client can never ask for
 * (or overwrite) the wrong slice.
 */
export const generateExercisesForWeek = onCall<GenerateExercisesForWeekRequest>(
  { secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to generate exercises.");
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

    const planRef = db.doc(`users/${uid}/plans/current`);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      throw new HttpsError("failed-precondition", "No plan exists to fill exercises for yet.");
    }
    const plan = planSnap.data() as PlanDoc;
    const todayKey = localDateKey(new Date(), plan.timezone || "UTC");

    const sliceEnd = addDaysToDateKey(plan.exerciseHorizon, FILL_WINDOW_DAYS);
    const candidates = plan.sessions
      .filter(
        (s) =>
          s.date > plan.exerciseHorizon &&
          s.date <= sliceEnd &&
          s.focus !== "rest" &&
          s.exercises === null &&
          !s.locked
      )
      .sort((a, b) => compareDateKeys(a.date, b.date));

    if (candidates.length === 0) {
      // Nothing to fill in this window (e.g. an all-rest week) - still worth
      // recomputing the horizon in case rest days already extend it further,
      // but no Gemini call/quota unit is spent when there's nothing to do.
      const recomputedHorizon = computeExerciseHorizon(plan.sessions, todayKey);
      if (recomputedHorizon !== plan.exerciseHorizon) {
        await planRef.set({ exerciseHorizon: recomputedHorizon }, { merge: true });
        return { ...plan, exerciseHorizon: recomputedHorizon };
      }
      return plan;
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

    // Same reason as generateSchedule.ts: refund the reserved unit if the
    // call never produced exercises.
    let filledById: Map<string, PlanExercise[]>;
    try {
      filledById = await runExerciseFill({
        sessions: candidates,
        experience: input.experience,
        sessionLengthMinutes: input.sessionLengthMinutes,
        gymMachines,
        userNotes,
      });
    } catch (err) {
      await refundAiQuota(uid);
      throw err;
    }

    // Re-read inside a transaction for the actual write: the Gemini call
    // above may take seconds, during which a concurrent log/sweep/edit could
    // have changed the plan doc. Re-checking `exercises === null && !locked`
    // per-session before applying guards against clobbering a session that
    // changed underneath this call.
    const updatedPlan = await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(planRef);
      if (!freshSnap.exists) {
        throw new HttpsError("failed-precondition", "Plan no longer exists.");
      }
      const freshPlan = freshSnap.data() as PlanDoc;
      const sessions = freshPlan.sessions.map((s) => {
        const filled = filledById.get(s.id);
        if (!filled || s.exercises !== null || s.locked) {
          return s;
        }
        return { ...s, exercises: filled, source: "ai_exercises" as const };
      });
      const next: PlanDoc = {
        ...freshPlan,
        sessions,
        exerciseHorizon: computeExerciseHorizon(sessions, todayKey),
        exercisesModelVersion: MODEL_ID,
      };
      tx.set(planRef, next);
      return next;
    });

    return updatedPlan;
  }
);
