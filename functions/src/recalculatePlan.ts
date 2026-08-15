import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { checkAndConsumeAiQuota, refundAiQuota } from "./quota";
import { generateExercisesForDays, generateTrainingPlan, geminiApiKey, MODEL_ID } from "./gemini";
import type {
  FeatureFlagsDoc,
  MachineDoc,
  MuscleGroup,
  TrainingPlanDay,
  TrainingPlanDoc,
  WorkoutLogDoc,
} from "./types";

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

    const currentPlanRef = db.doc(`users/${uid}/trainingPlans/current`);
    const currentPlanSnap = await currentPlanRef.get();
    const currentPlan = currentPlanSnap.exists ? (currentPlanSnap.data() as TrainingPlanDoc) : null;

    // A user who has hand-edited their exercises (via updateTrainingPlan)
    // does not want the week's schedule silently reshuffled out from under
    // them - regenerating the day/focus grid could move "legs day" to a
    // different dayIndex, stranding their curated exercises. Skip
    // regeneration entirely rather than losing that work; the plan stays
    // frozen until the user edits it again.
    if (currentPlan?.exercisesLocked) {
      return currentPlan;
    }

    // A full recalculation makes two Gemini calls (schedule, then
    // exercises), so it costs two quota units - reserved together, up
    // front, before either call runs. Reserving them one at a time (right
    // before each respective call) would let a user hit the cap between the
    // two: the first call already succeeded and cost a real Gemini request,
    // then the second reservation throws and the whole recalculation aborts
    // with nothing written, wasting that first call. Quota errors
    // (resource-exhausted, with minutes-remaining) propagate as-is so the
    // client can show them synchronously.
    await checkAndConsumeAiQuota(uid);
    try {
      await checkAndConsumeAiQuota(uid);
    } catch (err) {
      await refundAiQuota(uid);
      throw err;
    }

    const cutoff = Timestamp.fromMillis(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recentLogsSnap = await db
      .collection(`users/${uid}/workoutLogs`)
      .where("date", ">=", cutoff)
      .orderBy("date", "desc")
      .get();
    const recentLogs = recentLogsSnap.docs.map((d) => d.data() as WorkoutLogDoc);

    // See generateInitialPlan.ts for why a failed generation must refund the
    // quota reserved above, rather than permanently costing the user cap for
    // a failure that never produced a plan. Both reserved units are refunded
    // here (not just one) since neither Gemini call has run yet at this point.
    let generated;
    try {
      generated = await generateTrainingPlan({
        goal: currentPlan ? currentPlan.days.map((d) => d.focus).join(", ") : "General fitness",
        experience: "returning-user",
        daysPerWeek: currentPlan?.frequencyPerWeek ?? 3,
        sessionLengthMinutes: 60,
        recentWorkoutSummary: summarizeLogs(recentLogs),
        userNotes: "",
        basedOnLogId: logId,
      });
    } catch (err) {
      await refundAiQuota(uid);
      await refundAiQuota(uid);
      throw err;
    }

    const trainingDays = generated.days.filter((d) => d.focus !== "rest");

    // Ground the new exercises in whatever gym the user is currently
    // training at, same as generateExercisesForPlan.
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

    // The schedule call above already succeeded and used the first of the
    // two reserved units, so a failure here only refunds the second one -
    // the first was legitimately spent on a Gemini call that did complete.
    let generatedExercises;
    try {
      generatedExercises = await generateExercisesForDays({
        days: trainingDays.map((d) => ({ dayIndex: d.dayIndex, focus: d.focus })),
        experience: "returning-user",
        sessionLengthMinutes: 60,
        gymMachines,
        userNotes: "",
      });
    } catch (err) {
      await refundAiQuota(uid);
      throw err;
    }
    const exercisesByDayIndex = new Map(
      generatedExercises.days.map((d) => [d.dayIndex, d.exercises])
    );

    const days: TrainingPlanDay[] = generated.days.map((day) => ({
      ...day,
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
    const newPlan: TrainingPlanDoc = {
      generatedAt: now,
      basedOnLogId: logId,
      weekStart: currentPlan?.weekStart ?? now,
      frequencyPerWeek: currentPlan?.frequencyPerWeek ?? trainingDays.length,
      days,
      modelVersion: MODEL_ID,
      exercisesGeneratedAt: now,
      exercisesLocked: false,
      editedAt: null,
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
