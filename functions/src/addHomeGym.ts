import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";

interface AddHomeGymRequest {
  gymId: string;
}

/**
 * `/users/{uid}` denies all client writes in firestore.rules, so saving a
 * gym into the user's `homeGymIds` list (the "gyms you've used" set that
 * powers the Gym page's quick-switch row) goes through this callable rather
 * than a direct client write - same reasoning as updateUserSettings.ts.
 * Add-only (arrayUnion): removing a gym from the list is out of scope, same
 * as generateSchedule.ts's existing homeGymIds write.
 */
export const addHomeGym = onCall<AddHomeGymRequest>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to save a gym.");
  }
  const { gymId } = request.data ?? {};
  if (!gymId || typeof gymId !== "string") {
    throw new HttpsError("invalid-argument", "gymId is required.");
  }

  await db.doc(`users/${request.auth.uid}`).set(
    { homeGymIds: FieldValue.arrayUnion(gymId) },
    { merge: true }
  );

  return { success: true };
});
