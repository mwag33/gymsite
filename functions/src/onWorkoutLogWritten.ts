import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { db } from "./admin";
import { localDateKey } from "./dateUtils";
import { resolveSessionForLog } from "./planEngine";
import type {
  MachineCategory,
  MachineDoc,
  MachineStatsDoc,
  MachineStatsHistoryEntry,
  PlanDoc,
  WorkoutLogDoc,
} from "./types";

const VALID_CATEGORIES: MachineCategory[] = [
  "chest",
  "back",
  "legs",
  "core",
  "cardio",
  "upper_body",
  "other",
];

/**
 * Resolves the machine categories actually present in a log, for adherence
 * matching against a planned session. Simple-mode logs already carry
 * `bodyParts` as MachineCategory strings directly. Detailed-mode logs only
 * carry `machineId`/`gymId` per exercise, so each unique machine is looked up
 * for its category (deduped, since a session's exercises typically share one
 * category under the current exercise-generation prompt).
 */
async function resolveLoggedCategories(log: WorkoutLogDoc): Promise<MachineCategory[]> {
  if (log.mode === "simple") {
    const bodyParts = log.bodyParts ?? [];
    return Array.from(
      new Set(bodyParts.filter((c): c is MachineCategory => VALID_CATEGORIES.includes(c as MachineCategory)))
    );
  }

  const exercises = log.exercises ?? [];
  const uniquePairs = Array.from(new Set(exercises.map((e) => `${e.gymId}/${e.machineId}`)));
  const categories = await Promise.all(
    uniquePairs.map(async (pair) => {
      const [gymId, machineId] = pair.split("/");
      if (!gymId || !machineId) return null;
      const snap = await db.doc(`gyms/${gymId}/machines/${machineId}`).get();
      return snap.exists ? (snap.data() as MachineDoc).category : null;
    })
  );
  return Array.from(new Set(categories.filter((c): c is MachineCategory => c !== null)));
}

/**
 * Keeps per-machine stats in sync, and resolves the log's planned-session
 * adherence, whenever a workout log is written. Adherence resolution runs
 * for both simple and detailed logs (unlike machineStats aggregation below,
 * which only applies to detailed logs), so it must happen before that
 * early-return - it is purely deterministic (planEngine.ts), no AI, no quota.
 */
export const onWorkoutLogWritten = onDocumentCreated(
  "users/{uid}/workoutLogs/{logId}",
  async (event) => {
    const snap = event.data;
    if (!snap) {
      return;
    }

    const log = snap.data() as WorkoutLogDoc;
    const { uid, logId } = event.params;

    if (log.plannedSessionId) {
      const loggedCategories = await resolveLoggedCategories(log);
      const planRef = db.doc(`users/${uid}/plans/current`);

      // Same transactional read-modify-write pattern as the machineStats
      // transaction below, applied to the plan doc instead.
      await db.runTransaction(async (tx) => {
        const planSnap = await tx.get(planRef);
        if (!planSnap.exists) return;
        const plan = planSnap.data() as PlanDoc;
        const todayKey = localDateKey(new Date(), plan.timezone || "UTC");

        const result = resolveSessionForLog(
          plan,
          { plannedSessionId: log.plannedSessionId, mode: log.mode, loggedCategories },
          todayKey
        );
        if (result.changed) {
          tx.set(planRef, { sessions: result.sessions }, { merge: true });
        }
      });
    }

    // Simple-mode logs (body-part only) have no per-machine detail to aggregate.
    if (log.mode !== "detailed" || !log.exercises || log.exercises.length === 0) {
      return;
    }

    await Promise.all(
      log.exercises.map(async (exercise) => {
        const statsRef = db.doc(`users/${uid}/machineStats/${exercise.machineId}`);
        const historyRef = db
          .collection(`users/${uid}/machineStats/${exercise.machineId}/history`)
          .doc();

        const maxWeightInLog = exercise.sets.reduce(
          (max, set) => Math.max(max, set.weightKg),
          0
        );

        await db.runTransaction(async (tx) => {
          const statsSnap = await tx.get(statsRef);
          const existing = statsSnap.exists ? (statsSnap.data() as MachineStatsDoc) : null;

          const stats: MachineStatsDoc = {
            gymId: exercise.gymId,
            lastUsedAt: log.date,
            lastSets: exercise.sets,
            bestWeightKg: Math.max(existing?.bestWeightKg ?? 0, maxWeightInLog),
            totalSessions: (existing?.totalSessions ?? 0) + 1,
          };
          tx.set(statsRef, stats);

          const historyEntry: MachineStatsHistoryEntry = {
            date: log.date,
            sets: exercise.sets,
            sourceLogId: logId,
          };
          tx.set(historyRef, historyEntry);
        });
      })
    );
  }
);
