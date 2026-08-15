import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, auth } from "./admin";

/**
 * Deletes the caller's own account and all of their Firestore data.
 * Always operates on `request.auth.uid` - there is no uid parameter, so a
 * user can never delete anyone else's account.
 */
export const deleteAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to delete your account.");
  }
  const uid = request.auth.uid;

  await db.recursiveDelete(db.doc(`users/${uid}`));
  await auth.deleteUser(uid);

  return { success: true };
});
