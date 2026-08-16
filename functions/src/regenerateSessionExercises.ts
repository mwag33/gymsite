import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { checkAndConsumeAiQuota, refundAiQuota } from "./quota";
import { geminiApiKey, MODEL_ID } from "./gemini";
import { runExerciseFill } from "./generateExercisesForWeek";
import { localDateKey } from "./dateUtils";
import { computeExerciseHorizon } from "./planEngine";
import type { FeatureFlagsDoc, MachineDoc, PlanDoc, PlanExercise } from "./types";

interface RegenerateSessionExercisesRequest {
  sessionId: string;
  experience: string;
  sessionLengthMinutes: number;
  gymId: string | null;
  equipmentNotes?: string;
  injuryNotes?: string;
  preferences?: string;
}

/**
 * Regenerates exercises for exactly one session, on demand - e.g. right
 * after a manual focus swap on SessionDetailPage. This is deliberately a
 * separate callable from generateExercisesForWeek rather than a parameter on
 * it: that callable's candidate filter (`date > exerciseHorizon &&
 * exercises === null && !locked`) is a "server decides the slice" contract
 * that a swapped, already-locked, before-horizon day can never satisfy -
 * bypassing it with a client-supplied id would weaken that guarantee for
 * every caller, not just this one. Reuses the same runExerciseFill core the
 * horizon-fill callable uses, just scoped to a single caller-chosen session.
 */
export const regenerateSessionExercises = onCall<RegenerateSessionExercisesRequest>(
  { secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to regenerate exercises.");
    }
    const uid = request.auth.uid;
    const input = request.data;

    if (!input?.sessionId || typeof input.sessionId !== "string") {
      throw new HttpsError("invalid-argument", "sessionId is required.");
    }

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
      throw new HttpsError("failed-precondition", "No plan exists to regenerate exercises for.");
    }
    const plan = planSnap.data() as PlanDoc;
    const session = plan.sessions.find((s) => s.id === input.sessionId);
    if (!session) {
      throw new HttpsError("not-found", "No session with that id in the current plan.");
    }
    const todayKey = localDateKey(new Date(), plan.timezone || "UTC");

    if (session.focus === "rest") {
      // Rest days carry `[]`, never generated exercises - nothing to do.
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

    let filledById: Map<string, PlanExercise[]>;
    try {
      filledById = await runExerciseFill({
        sessions: [session],
        experience: input.experience,
        sessionLengthMinutes: input.sessionLengthMinutes,
        gymMachines,
        userNotes,
      });
    } catch (err) {
      await refundAiQuota(uid);
      throw err;
    }

    const updatedPlan = await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(planRef);
      if (!freshSnap.exists) {
        throw new HttpsError("failed-precondition", "Plan no longer exists.");
      }
      const freshPlan = freshSnap.data() as PlanDoc;
      const filled = filledById.get(input.sessionId);
      const sessions = freshPlan.sessions.map((s) =>
        s.id === input.sessionId && filled
          ? { ...s, exercises: filled, source: "ai_exercises" as const }
          : s
      );
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
