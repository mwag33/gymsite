import { randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { checkAndConsumeAiQuota, refundAiQuota } from "./quota";
import { generateTrainingSchedule, geminiApiKey } from "./gemini";
import { addDaysToDateKey, localDateKey } from "./dateUtils";
import type { DraftDay, FeatureFlagsDoc, UserSettings } from "./types";

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

/**
 * Onboarding-only, one-time call: generates a single 7-day draft week (day 0
 * = today) that becomes both the reviewed first week and, once the wizard
 * finishes, the repeating UserProfile.weeklyFocusPattern. Nothing is
 * persisted to Firestore here beyond the user's basic profile fields - the
 * draft week itself lives in the client's local state for the rest of the
 * wizard (see frontend/src/pages/onboarding/OnboardingFlow.tsx).
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
    const existingSettings = userSnap.data()?.settings as UserSettings | undefined;
    const timezone = existingSettings?.timezone || "UTC";
    const todayKey = localDateKey(new Date(), timezone);

    const userNotes = [
      input.equipmentNotes && `equipment: ${input.equipmentNotes}`,
      input.injuryNotes && `injuries/limitations: ${input.injuryNotes}`,
      input.preferences && `preferences: ${input.preferences}`,
    ]
      .filter(Boolean)
      .join("\n");

    let days: DraftDay[];
    try {
      const generated = await generateTrainingSchedule({
        goal: input.goal,
        experience: input.experience,
        daysPerWeek: input.daysPerWeek,
        sessionLengthMinutes: input.sessionLengthMinutes,
        userNotes,
      });
      days = generated.days.map((d) => ({
        id: randomUUID(),
        date: addDaysToDateKey(todayKey, d.dayOffset),
        focus: d.focus,
        note: d.note,
        exercises: null,
      }));
    } catch (err) {
      await refundAiQuota(uid);
      throw err;
    }

    const now = Timestamp.now();
    const settingsUpdate: Partial<UserSettings> = {
      units: input.units ?? "metric",
      weekStartsOn: input.weekStartsOn ?? 1,
      timezone,
    };
    const userUpdate: Record<string, unknown> = {
      goal: input.goal,
      goalUpdatedAt: now,
      settings: settingsUpdate,
      experienceLevel: input.experience,
      daysPerWeek: input.daysPerWeek,
      sessionLengthMinutes: input.sessionLengthMinutes,
      equipmentNotes: input.equipmentNotes ?? null,
      injuryNotes: input.injuryNotes ?? null,
    };
    if (input.gymId) {
      userUpdate.homeGymIds = FieldValue.arrayUnion(input.gymId);
    }
    await db.doc(`users/${uid}`).set(userUpdate, { merge: true });

    return { days };
  }
);
