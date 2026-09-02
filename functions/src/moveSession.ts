import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { localDateKey } from "./dateUtils";
import type { PlanDoc } from "./types";

interface MoveSessionRequest {
  sessionId: string;
  targetDate: string; // "YYYY-MM-DD"
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Proactive, user-initiated day move ("I can't train Wednesday, move it to
 * Thursday") - distinct from the reactive, automatic rebalance the daily
 * sweep runs after a miss (see planEngine.ts's rebalancePlan, untouched by
 * this file). Move-to-empty-day only: the target must already be an
 * unlocked rest day, so this never overwrites another day's content or
 * invents new rebalance semantics - it's the same restriction
 * rebalancePlan already enforces on itself.
 */
export const moveSession = onCall<MoveSessionRequest>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to move a session.");
  }
  const uid = request.auth.uid;
  const { sessionId, targetDate } = request.data ?? {};

  if (!sessionId || typeof sessionId !== "string") {
    throw new HttpsError("invalid-argument", "sessionId is required.");
  }
  if (!targetDate || typeof targetDate !== "string" || !DATE_KEY_PATTERN.test(targetDate)) {
    throw new HttpsError("invalid-argument", "targetDate must be a YYYY-MM-DD string.");
  }

  const planRef = db.doc(`users/${uid}/plans/current`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(planRef);
    if (!snap.exists) {
      throw new HttpsError("failed-precondition", "No plan exists to edit yet.");
    }
    const plan = snap.data() as PlanDoc;
    // Same "avoid rescheduling into the past" guard rebalancePlan documents
    // in planEngine.ts - a session's `status` only flips to skipped/done via
    // the daily sweep, so a stale plan doc mid-sweep-cycle could otherwise
    // still show a past date as "upcoming".
    const todayKey = localDateKey(new Date(), plan.timezone || "UTC");

    const sourceIdx = plan.sessions.findIndex((s) => s.id === sessionId);
    if (sourceIdx === -1) {
      throw new HttpsError("not-found", "No session with that id in the current plan.");
    }
    const source = plan.sessions[sourceIdx];

    if (source.status !== "upcoming" || source.date < todayKey) {
      throw new HttpsError("failed-precondition", "Only an upcoming session can be moved.");
    }
    if (source.focus === "rest") {
      throw new HttpsError("failed-precondition", "Rest days can't be moved.");
    }

    if (targetDate < todayKey) {
      throw new HttpsError("failed-precondition", "Can't move a session into the past.");
    }
    const targetIdx = plan.sessions.findIndex((s) => s.date === targetDate);
    if (targetIdx === -1) {
      throw new HttpsError("failed-precondition", "That date isn't in your current plan window.");
    }
    const target = plan.sessions[targetIdx];
    if (target.focus !== "rest" || target.locked) {
      throw new HttpsError(
        "failed-precondition",
        "That day already has a planned session - pick an empty day instead."
      );
    }

    const sessions = plan.sessions.map((s, i) => {
      if (i === sourceIdx) {
        // Vacate: becomes a locked rest day so the rebalancer never later
        // repurposes it (rebalancePlan's candidate filter requires
        // !locked) and an AI schedule refresh must reproduce it exactly.
        return {
          ...s,
          focus: "rest" as const,
          note: `Moved to ${targetDate}.`,
          exercises: [],
          status: "upcoming" as const,
          locked: true,
          source: "manual_reschedule" as const,
        };
      }
      if (i === targetIdx) {
        return {
          ...s,
          focus: source.focus,
          // Overwrite with the move reason, not the source session's own
          // coaching note - same convention rebalancePlan uses in
          // planEngine.ts, and what AdjustmentBanner renders verbatim.
          note: `Moved from ${source.date}.`,
          exercises: source.exercises,
          status: "upcoming" as const,
          locked: true,
          source: "manual_reschedule" as const,
          rescheduledFromSessionId: source.id,
        };
      }
      return s;
    });

    tx.set(planRef, { sessions }, { merge: true });
  });

  return { success: true };
});
