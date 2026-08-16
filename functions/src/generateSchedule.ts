import { randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { checkAndConsumeAiQuota, refundAiQuota } from "./quota";
import {
  generateTrainingSchedule,
  geminiApiKey,
  MODEL_ID,
  type ScheduleConstraint,
} from "./gemini";
import { addDaysToDateKey, compareDateKeys, diffDaysBetweenDateKeys, localDateKey } from "./dateUtils";
import { computeExerciseHorizon, computeProtectedWindow } from "./planEngine";
import type { FeatureFlagsDoc, PlanDoc, Session, UserSettings } from "./types";

interface GenerateScheduleRequest {
  goal: string;
  experience: string;
  daysPerWeek: number;
  sessionLengthMinutes: number;
  gymId: string | null;
  equipmentNotes?: string;
  injuryNotes?: string;
  preferences?: string;
  units?: "metric" | "imperial";
  weekStartsOn?: number;
}

// Archived plans live under `plans/current/history/{planId}` - see
// firestore.rules for why (even-segment subcollection requirement).
function historyCollection(uid: string) {
  return db.collection(`users/${uid}/plans/current/history`);
}

function nextPlanId(current: string | undefined): string {
  const n = current ? Number(current) : NaN;
  return String(Number.isFinite(n) ? n + 1 : 1);
}

/**
 * A session is a fixed constraint on a schedule refresh if it falls in the
 * protected window (next 2 upcoming training-focus sessions, plus any rest
 * days interleaved before them) or if it's been manually locked by the user
 * via updateSession - either way the AI must reproduce it exactly, not treat
 * it as a gap to fill. Exported for reuse by regeneratePlan.ts, which needs
 * the identical constraint set for its own schedule-refresh call.
 */
export function computeScheduleConstraints(sessions: Session[], todayKey: string): Session[] {
  const protectedWindow = computeProtectedWindow(sessions, todayKey);
  const protectedIds = new Set(protectedWindow.map((s) => s.id));
  const lockedUpcoming = sessions.filter(
    (s) => s.locked && s.date >= todayKey && !protectedIds.has(s.id)
  );
  return [...protectedWindow, ...lockedUpcoming];
}

export interface RunScheduleGenerationParams {
  goal: string;
  experience: string;
  daysPerWeek: number;
  sessionLengthMinutes: number;
  recentWorkoutSummary: string;
  userNotes: string;
  todayKey: string;
  /** Sessions that must be preserved exactly - see computeScheduleConstraints. */
  constraints: Session[];
}

/**
 * Core schedule-generation logic, shared by the `generateSchedule` callable
 * (below) and `regeneratePlan.ts`. Does not touch quota or Firestore - the
 * caller owns both, since the two callers reserve/refund quota differently
 * (1 unit here, 2 up front in regeneratePlan.ts).
 */
export async function runScheduleGeneration(params: RunScheduleGenerationParams): Promise<Session[]> {
  const fixedDays: ScheduleConstraint[] = params.constraints.map((s) => ({
    dayOffset: diffDaysBetweenDateKeys(params.todayKey, s.date),
    focus: s.focus,
    note: s.note,
  }));

  const generated = await generateTrainingSchedule({
    goal: params.goal,
    experience: params.experience,
    daysPerWeek: params.daysPerWeek,
    sessionLengthMinutes: params.sessionLengthMinutes,
    recentWorkoutSummary: params.recentWorkoutSummary,
    userNotes: params.userNotes,
    fixedDays,
  });

  const merged = new Map<number, Session>();
  for (const day of generated.days) {
    const date = addDaysToDateKey(params.todayKey, day.dayOffset);
    merged.set(day.dayOffset, {
      id: randomUUID(),
      date,
      focus: day.focus,
      note: day.note,
      exercises: day.focus === "rest" ? [] : null,
      status: "upcoming",
      locked: false,
      source: "ai_schedule",
      loggedAt: null,
      swappedFocus: null,
      rescheduledFromSessionId: null,
    });
  }
  // Constraints always win at their offset - never trust Gemini's echoed
  // copy of a fixed day, only its placement of the days around it.
  fixedDays.forEach((f, i) => merged.set(f.dayOffset, params.constraints[i]));

  return Array.from(merged.values()).sort((a, b) => compareDateKeys(a.date, b.date));
}

/**
 * Generates (onboarding, no current plan) or refreshes (any later call - the
 * periodic ~21-day refresh, wired client-side) the ~28-day schedule. Exactly
 * one Gemini call: exercises are always left null/[] here and filled
 * separately by generateExercisesForWeek's rolling horizon fill, except for
 * constrained sessions carried over verbatim (which may already have
 * exercises from before). See regeneratePlan.ts for the explicit/drift path
 * that also immediately re-fills exercises for the near-term unlocked
 * portion.
 */
export const generateSchedule = onCall<GenerateScheduleRequest>(
  { secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to generate a schedule.");
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

    await checkAndConsumeAiQuota(uid);

    const userSnap = await db.doc(`users/${uid}`).get();
    const settings = userSnap.data()?.settings as UserSettings | undefined;
    const timezone = settings?.timezone || "UTC";
    const todayKey = localDateKey(new Date(), timezone);

    const currentPlanRef = db.doc(`users/${uid}/plans/current`);
    const currentPlanSnap = await currentPlanRef.get();
    const currentPlan = currentPlanSnap.exists ? (currentPlanSnap.data() as PlanDoc) : null;

    const constraints = currentPlan
      ? computeScheduleConstraints(currentPlan.sessions, todayKey)
      : [];

    const userNotes = [
      input.equipmentNotes && `equipment: ${input.equipmentNotes}`,
      input.injuryNotes && `injuries/limitations: ${input.injuryNotes}`,
      input.preferences && `preferences: ${input.preferences}`,
    ]
      .filter(Boolean)
      .join("\n");

    // See generateInitialPlan.ts's historical comment (same reasoning): the
    // quota unit is reserved before the Gemini call, so a failure that never
    // produced a schedule must refund it.
    let sessions: Session[];
    try {
      sessions = await runScheduleGeneration({
        goal: input.goal,
        experience: input.experience,
        daysPerWeek: input.daysPerWeek,
        sessionLengthMinutes: input.sessionLengthMinutes,
        recentWorkoutSummary: currentPlan
          ? "Existing plan being refreshed - see fixed days for what must be preserved."
          : "No prior schedule yet - this is the user's first plan.",
        userNotes,
        todayKey,
        constraints,
      });
    } catch (err) {
      await refundAiQuota(uid);
      throw err;
    }

    const now = Timestamp.now();
    const plan: PlanDoc = {
      planId: nextPlanId(currentPlan?.planId),
      timezone,
      scheduleGeneratedAt: now,
      scheduleModelVersion: MODEL_ID,
      exercisesModelVersion: currentPlan?.exercisesModelVersion ?? null,
      frequencyPerWeek: input.daysPerWeek,
      exerciseHorizon: computeExerciseHorizon(sessions, todayKey),
      needsScheduleRefresh: false,
      sessions,
      lastSweepAt: now,
    };

    const settingsUpdate: Partial<UserSettings> = {
      units: input.units ?? "metric",
      weekStartsOn: input.weekStartsOn ?? 1,
      timezone,
    };
    const userUpdate: Record<string, unknown> = {
      goal: input.goal,
      goalUpdatedAt: now,
      settings: settingsUpdate,
    };
    if (input.gymId) {
      userUpdate.homeGymIds = FieldValue.arrayUnion(input.gymId);
    }

    // Archive the outgoing plan and write the new one together, same
    // pattern as recalculatePlan.ts, so a partial failure never leaves
    // "current" overwritten without a backup.
    const batch = db.batch();
    if (currentPlan) {
      batch.set(historyCollection(uid).doc(), currentPlan);
    }
    batch.set(currentPlanRef, plan);
    await batch.commit();
    await db.doc(`users/${uid}`).set(userUpdate, { merge: true });

    return plan;
  }
);
