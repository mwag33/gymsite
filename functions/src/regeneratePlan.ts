import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { checkAndConsumeAiQuota, refundAiQuota } from "./quota";
import { geminiApiKey, MODEL_ID } from "./gemini";
import { computeScheduleConstraints, runScheduleGeneration } from "./generateSchedule";
import { runExerciseFill } from "./generateExercisesForWeek";
import { addDaysToDateKey, localDateKey } from "./dateUtils";
import { computeExerciseHorizon } from "./planEngine";
import type { FeatureFlagsDoc, MachineDoc, PlanDoc, Session, WorkoutLogDoc } from "./types";

const RECENT_WINDOW_DAYS = 14;
// "the unlocked portion of the current/next week" per the plan doc - two
// calendar weeks from today, so both this week and next week are covered.
const REFILL_WINDOW_DAYS = 14;

function historyCollection(uid: string) {
  return db.collection(`users/${uid}/plans/current/history`);
}

function nextPlanId(current: string | undefined): string {
  const n = current ? Number(current) : NaN;
  return String(Number.isFinite(n) ? n + 1 : 1);
}

function summarizeLogs(logs: WorkoutLogDoc[]): string {
  if (logs.length === 0) {
    return `No workouts logged in the last ${RECENT_WINDOW_DAYS} days.`;
  }
  return logs
    .map((log) => {
      const detail =
        log.mode === "simple"
          ? (log.bodyParts ?? []).join("/") || "unspecified body parts"
          : `${log.exercises?.length ?? 0} exercise(s)`;
      return `- ${log.mode} session covering ${detail}`;
    })
    .join("\n");
}

/**
 * Thin, explicit/drift-prompted plan regeneration - no longer wired to every
 * logged workout (the deterministic engine in planEngine.ts handles that for
 * free). This is the path behind an explicit "regenerate my plan" action or
 * the user accepting the sweep's `needsScheduleRefresh` prompt.
 *
 * Makes up to two Gemini calls (schedule, then a near-term exercise re-fill
 * for whatever changed focus) and reserves both quota units up front, with
 * the same partial-refund-on-partial-failure logic as the old
 * recalculatePlan.ts: reserving them one at a time would let a user hit the
 * cap between the two calls, wasting a Gemini request that already
 * succeeded when the second reservation throws.
 */
export const regeneratePlan = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to regenerate your plan.");
    }
    const uid = request.auth.uid;

    const flagsSnap = await db.doc("system/featureFlags").get();
    const flags = flagsSnap.data() as FeatureFlagsDoc | undefined;
    if (flags?.aiGenerationEnabled === false) {
      throw new HttpsError(
        "unavailable",
        "AI plan generation is temporarily paused. Please try again later."
      );
    }

    const currentPlanRef = db.doc(`users/${uid}/plans/current`);
    const currentPlanSnap = await currentPlanRef.get();
    if (!currentPlanSnap.exists) {
      throw new HttpsError("failed-precondition", "No plan exists to regenerate yet.");
    }
    const currentPlan = currentPlanSnap.data() as PlanDoc;

    const todayKey = localDateKey(new Date(), currentPlan.timezone || "UTC");

    // Quota errors (resource-exhausted, with minutes-remaining) propagate
    // as-is so the client can show them synchronously.
    await checkAndConsumeAiQuota(uid);
    try {
      await checkAndConsumeAiQuota(uid);
    } catch (err) {
      await refundAiQuota(uid);
      throw err;
    }

    const constraints = computeScheduleConstraints(currentPlan.sessions, todayKey);

    const cutoff = Timestamp.fromMillis(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recentLogsSnap = await db
      .collection(`users/${uid}/workoutLogs`)
      .where("date", ">=", cutoff)
      .orderBy("date", "desc")
      .get();
    const recentLogs = recentLogsSnap.docs.map((d) => d.data() as WorkoutLogDoc);

    const trainingFocuses = currentPlan.sessions
      .filter((s) => s.focus !== "rest")
      .map((s) => s.focus);

    // Both reserved units are refunded here (not just one) since neither
    // Gemini call has run yet at this point - same as recalculatePlan.ts.
    let newSessions: Session[];
    try {
      newSessions = await runScheduleGeneration({
        goal: trainingFocuses.length > 0 ? trainingFocuses.join(", ") : "General fitness",
        experience: "returning-user",
        daysPerWeek: currentPlan.frequencyPerWeek,
        sessionLengthMinutes: 60,
        recentWorkoutSummary: summarizeLogs(recentLogs),
        userNotes: "",
        todayKey,
        constraints,
      });
    } catch (err) {
      await refundAiQuota(uid);
      await refundAiQuota(uid);
      throw err;
    }

    const oldSessionsByDate = new Map(currentPlan.sessions.map((s) => [s.date, s]));
    const refillCutoff = addDaysToDateKey(todayKey, REFILL_WINDOW_DAYS);
    const constrainedIds = new Set(constraints.map((s) => s.id));

    const changedFocusSessions = newSessions.filter((s) => {
      if (constrainedIds.has(s.id) || s.locked || s.focus === "rest") return false;
      if (s.date < todayKey || s.date > refillCutoff) return false;
      const old = oldSessionsByDate.get(s.date);
      return !old || old.focus !== s.focus;
    });

    let exercisesModelVersion = currentPlan.exercisesModelVersion;

    if (changedFocusSessions.length === 0) {
      // Nothing needs a fresh exercise call - refund the second reserved
      // unit immediately rather than spending it on nothing.
      await refundAiQuota(uid);
    } else {
      const userSnap = await db.doc(`users/${uid}`).get();
      const activeGymId = (userSnap.data()?.settings?.activeGymId as string | null | undefined) ?? null;
      let gymMachines: { name: string; category: string }[] = [];
      if (activeGymId) {
        const machinesSnap = await db
          .collection(`gyms/${activeGymId}/machines`)
          .where("archived", "==", false)
          .get();
        gymMachines = machinesSnap.docs.map((d) => {
          const m = d.data() as MachineDoc;
          return { name: m.name, category: m.category };
        });
      }

      // The schedule call above already succeeded and used the first
      // reserved unit, so a failure here only refunds the second one.
      let filledMap;
      try {
        filledMap = await runExerciseFill({
          sessions: changedFocusSessions,
          experience: "returning-user",
          sessionLengthMinutes: 60,
          gymMachines,
          userNotes: "",
        });
      } catch (err) {
        await refundAiQuota(uid);
        throw err;
      }

      newSessions = newSessions.map((s) => {
        const filled = filledMap.get(s.id);
        return filled ? { ...s, exercises: filled, source: "ai_exercises" as const } : s;
      });
      exercisesModelVersion = MODEL_ID;
    }

    const now = Timestamp.now();
    const newPlan: PlanDoc = {
      planId: nextPlanId(currentPlan.planId),
      timezone: currentPlan.timezone,
      scheduleGeneratedAt: now,
      scheduleModelVersion: MODEL_ID,
      exercisesModelVersion,
      frequencyPerWeek: currentPlan.frequencyPerWeek,
      exerciseHorizon: computeExerciseHorizon(newSessions, todayKey),
      needsScheduleRefresh: false,
      sessions: newSessions,
      lastSweepAt: now,
    };

    // Archive the outgoing plan and write the new one together so a partial
    // failure never leaves "current" overwritten without a backup.
    const batch = db.batch();
    batch.set(historyCollection(uid).doc(), currentPlan);
    batch.set(currentPlanRef, newPlan);
    await batch.commit();

    return newPlan;
  }
);
