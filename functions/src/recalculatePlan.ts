import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { checkAndConsumeAiQuota } from "./quota";
import { generateTrainingPlan, geminiApiKey, MODEL_ID } from "./gemini";
import type { FeatureFlagsDoc, TrainingPlanDoc, WorkoutLogDoc } from "./types";

interface RecalculatePlanRequest {
  logId: string;
}

const RECENT_WINDOW_DAYS = 14;

// Archived plans live under `trainingPlans/current/history/{planId}` - i.e. a
// `history` subcollection nested under the single `current` plan document,
// mirroring the `machineStats/{machineId}/history/{entryId}` pattern used
// elsewhere in this data model. `trainingPlans` itself only ever holds one
// real document ("current"); this keeps every archived plan reachable and
// queryable per user without a second top-level collection.
function historyCollection(uid: string) {
  return db.collection(`users/${uid}/trainingPlans/current/history`);
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

export const recalculatePlan = onCall<RecalculatePlanRequest>(
  { secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to recalculate your plan.");
    }
    const uid = request.auth.uid;
    const { logId } = request.data;
    if (!logId) {
      throw new HttpsError("invalid-argument", "logId is required.");
    }

    const flagsSnap = await db.doc("system/featureFlags").get();
    const flags = flagsSnap.data() as FeatureFlagsDoc | undefined;
    if (flags?.aiGenerationEnabled === false) {
      throw new HttpsError(
        "unavailable",
        "AI plan generation is temporarily paused. Please try again later."
      );
    }

    // Quota errors (resource-exhausted, with minutes-remaining) propagate
    // as-is so the client can show them synchronously.
    await checkAndConsumeAiQuota(uid);

    const currentPlanRef = db.doc(`users/${uid}/trainingPlans/current`);
    const cutoff = Timestamp.fromMillis(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [currentPlanSnap, recentLogsSnap] = await Promise.all([
      currentPlanRef.get(),
      db
        .collection(`users/${uid}/workoutLogs`)
        .where("date", ">=", cutoff)
        .orderBy("date", "desc")
        .get(),
    ]);

    const recentLogs = recentLogsSnap.docs.map((d) => d.data() as WorkoutLogDoc);
    const currentPlan = currentPlanSnap.exists ? (currentPlanSnap.data() as TrainingPlanDoc) : null;

    const generated = await generateTrainingPlan({
      goal: currentPlan ? currentPlan.days.map((d) => d.focus).join(", ") : "General fitness",
      experience: "returning-user",
      daysPerWeek: currentPlan?.frequencyPerWeek ?? 3,
      sessionLengthMinutes: 60,
      recentWorkoutSummary: summarizeLogs(recentLogs),
      userNotes: "",
      basedOnLogId: logId,
    });

    const now = Timestamp.now();
    const newPlan: TrainingPlanDoc = {
      generatedAt: now,
      basedOnLogId: logId,
      weekStart: currentPlan?.weekStart ?? now,
      frequencyPerWeek:
        currentPlan?.frequencyPerWeek ?? generated.days.filter((d) => d.focus !== "rest").length,
      days: generated.days,
      modelVersion: MODEL_ID,
    };

    // Archive the outgoing plan and write the new one atomically so a
    // partial failure never leaves "current" overwritten without a backup.
    const batch = db.batch();
    if (currentPlan) {
      batch.set(historyCollection(uid).doc(), currentPlan);
    }
    batch.set(currentPlanRef, newPlan);
    await batch.commit();

    return newPlan;
  }
);
