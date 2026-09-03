import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { db } from "./admin";
import type { MachineStatsDoc, MachineStatsHistoryEntry, WorkoutLogDoc } from "./types";

/**
 * Keeps per-machine stats in sync whenever a workout log is written -
 * feeds the history-ranked exercise suggestions ("Based on what you usually
 * do"), "Same as last time," and MachineTrends. Simple-mode logs (body-part
 * only, no machine detail) have nothing to aggregate here.
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
