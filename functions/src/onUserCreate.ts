import * as functionsV1 from "firebase-functions/v1";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import type { AiQuotaDoc, UserDoc } from "./types";

/**
 * Provisions a user's Firestore profile on first sign-in.
 *
 * This intentionally uses the v1 Auth trigger (`functions.auth.user().onCreate`)
 * rather than the v2 `beforeUserCreated` blocking function. `beforeUserCreated`
 * runs synchronously in the sign-up critical path (a strict ~7s timeout) and
 * requires Identity Platform blocking functions to be enabled on the project;
 * it's designed for allow/deny decisions and custom claims, not general
 * side-effect writes. The v1 trigger fires asynchronously after the account
 * already exists, which is the currently-supported, non-blocking way to
 * bootstrap a user profile document.
 */
export const onUserCreate = functionsV1.auth.user().onCreate(async (user) => {
  const now = Timestamp.now();

  const isGoogle = user.providerData.some((p) => p.providerId === "google.com");

  const userDoc: UserDoc = {
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    authProvider: isGoogle ? "google" : "password",
    createdAt: now,
    goal: null,
    goalUpdatedAt: null,
    experienceLevel: null,
    daysPerWeek: null,
    sessionLengthMinutes: null,
    equipmentNotes: null,
    injuryNotes: null,
    homeGymIds: [],
    settings: {
      units: "metric",
      weekStartsOn: 1,
      notificationsEnabled: true,
      activeGymId: null,
      logModeDefault: "simple",
      // Reasonable server-side default only - only the client knows the
      // user's actual IANA zone (Intl.DateTimeFormat().resolvedOptions().timeZone),
      // which should overwrite this via updateUserSettings at onboarding.
      timezone: "UTC",
    },
    emailVerified: user.emailVerified,
    weeklyFocusPattern: null,
  };

  const quotaDoc: AiQuotaDoc = {
    dailyCount: 0,
    windowStartedAt: now,
  };

  const batch = db.batch();
  batch.set(db.doc(`users/${user.uid}`), userDoc);
  batch.set(db.doc(`users/${user.uid}/meta/aiQuota`), quotaDoc);
  await batch.commit();
});
