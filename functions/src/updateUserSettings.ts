import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { ALLOWED_USER_SETTINGS_KEYS, type UserSettings } from "./types";

interface UpdateUserSettingsRequest {
  settings: Partial<UserSettings>;
}

// `/users/{uid}` denies all client writes in firestore.rules (the whole
// profile document is server-managed), so even low-stakes settings toggles
// (units, active gym, default log mode) go through this callable rather than
// a direct client write. It only ever merges into the `settings` map — never
// `goal`, `homeGymIds`, or any other profile field.
export const updateUserSettings = onCall<UpdateUserSettingsRequest>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to update settings.");
  }
  const uid = request.auth.uid;
  const partial = request.data?.settings;

  if (!partial || typeof partial !== "object" || Array.isArray(partial)) {
    throw new HttpsError("invalid-argument", "settings must be an object.");
  }

  const keys = Object.keys(partial);
  const unknownKeys = keys.filter(
    (key) => !ALLOWED_USER_SETTINGS_KEYS.includes(key as keyof UserSettings)
  );
  if (unknownKeys.length > 0) {
    throw new HttpsError("invalid-argument", `Unknown settings field(s): ${unknownKeys.join(", ")}`);
  }
  if (keys.length === 0) {
    return { success: true };
  }

  await db.doc(`users/${uid}`).set({ settings: partial }, { merge: true });
  return { success: true };
});
