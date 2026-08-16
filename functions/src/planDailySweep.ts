import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "./admin";
import { localDateKey } from "./dateUtils";
import { runDailySweep } from "./planEngine";
import type { PlanDoc, UserSettings } from "./types";

/**
 * Hourly sweep: a log-write trigger alone can never detect an absent log, so
 * this closes that gap. Iterates every user's plan doc via a
 * `collectionGroup("plans")` query (matching field override already added
 * in firestore.indexes.json on `lastSweepAt`), and for each one whose local
 * calendar date (per UserSettings.timezone) has advanced past `lastSweepAt`,
 * runs the deterministic sweep: mark past-due sessions skipped, rebalance,
 * roll the rolling window, and flag `needsScheduleRefresh` on adherence
 * drift. Never calls Gemini.
 */
export const planDailySweep = onSchedule("0 * * * *", async () => {
  const plansSnap = await db.collectionGroup("plans").get();

  for (const planDoc of plansSnap.docs) {
    // users/{uid}/plans/current -> parent.parent is the users/{uid} doc.
    const userRef = planDoc.ref.parent.parent;
    if (!userRef) continue;

    try {
      await db.runTransaction(async (tx) => {
        // Firestore transactions require all reads before any writes.
        const [freshPlanSnap, userSnap] = await Promise.all([tx.get(planDoc.ref), tx.get(userRef)]);
        if (!freshPlanSnap.exists) return;

        const plan = freshPlanSnap.data() as PlanDoc;
        // `timezone` is a new field - default to UTC rather than throwing
        // for any user doc that predates it.
        const settings = userSnap.data()?.settings as UserSettings | undefined;
        const timezone = settings?.timezone || "UTC";

        const todayKey = localDateKey(new Date(), timezone);
        const lastSweepKey = localDateKey(plan.lastSweepAt.toDate(), timezone);
        if (todayKey <= lastSweepKey) {
          // Local calendar date hasn't advanced since the last sweep yet.
          return;
        }

        const updated = runDailySweep(plan, todayKey);
        tx.set(planDoc.ref, updated);
      });
    } catch (err) {
      // One user's malformed plan doc must never abort the sweep for
      // everyone else.
      console.error(`planDailySweep: failed for ${planDoc.ref.path}`, err);
    }
  }
});
