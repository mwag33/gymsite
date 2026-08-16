import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { MUSCLE_GROUP_ENUM } from "./gemini";
import type { Session } from "./types";

interface UpdateSessionRequest {
  sessionId: string;
  patch?: Partial<Pick<Session, "focus" | "note" | "exercises">>;
  lock?: boolean;
  unlock?: boolean;
}

const FOCUS_VALUES = ["chest", "back", "legs", "core", "cardio", "upper_body", "rest"];
const CATEGORY_VALUES = ["chest", "back", "legs", "core", "cardio", "upper_body", "other"];
const MUSCLE_VALUES = new Set(MUSCLE_GROUP_ENUM);

function isValidExercise(ex: unknown): boolean {
  if (!ex || typeof ex !== "object") return false;
  const e = ex as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.name === "string" &&
    e.name.length > 0 &&
    e.name.length <= 80 &&
    Number.isInteger(e.sets) &&
    (e.sets as number) >= 1 &&
    (e.sets as number) <= 10 &&
    typeof e.reps === "string" &&
    e.reps.length <= 20 &&
    Array.isArray(e.targetMuscles) &&
    e.targetMuscles.every((m) => typeof m === "string" && MUSCLE_VALUES.has(m)) &&
    typeof e.machineCategory === "string" &&
    CATEGORY_VALUES.includes(e.machineCategory) &&
    (e.note === undefined || typeof e.note === "string")
  );
}

function isValidPatch(patch: unknown): patch is UpdateSessionRequest["patch"] {
  if (patch === undefined) return true;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;
  const p = patch as Record<string, unknown>;
  const allowedKeys = ["focus", "note", "exercises"];
  if (!Object.keys(p).every((k) => allowedKeys.includes(k))) return false;
  if (p.focus !== undefined && !(typeof p.focus === "string" && FOCUS_VALUES.includes(p.focus))) {
    return false;
  }
  if (p.note !== undefined && typeof p.note !== "string") return false;
  if (p.exercises !== undefined) {
    if (p.exercises !== null && (!Array.isArray(p.exercises) || !p.exercises.every(isValidExercise))) {
      return false;
    }
  }
  return true;
}

/**
 * The only client-driven write path to `plans/current` (otherwise
 * `allow write: if false` in firestore.rules). Validates and writes exactly
 * one session by id inside a transaction - unlike the old
 * updateTrainingPlan.ts, this never requires the full sessions[] array from
 * the client, so editing one day can never accidentally clobber the rest of
 * the rolling window.
 */
export const updateSession = onCall<UpdateSessionRequest>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to edit a session.");
  }
  const uid = request.auth.uid;
  const { sessionId, patch, lock, unlock } = request.data ?? {};

  if (!sessionId || typeof sessionId !== "string") {
    throw new HttpsError("invalid-argument", "sessionId is required.");
  }
  if (!isValidPatch(patch)) {
    throw new HttpsError("invalid-argument", "patch failed validation.");
  }
  if (lock === true && unlock === true) {
    throw new HttpsError("invalid-argument", "lock and unlock cannot both be set.");
  }

  const planRef = db.doc(`users/${uid}/plans/current`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(planRef);
    if (!snap.exists) {
      throw new HttpsError("failed-precondition", "No plan exists to edit yet.");
    }
    const plan = snap.data() as { sessions: Session[] };
    const idx = plan.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) {
      throw new HttpsError("not-found", "No session with that id in the current plan.");
    }

    const existing = plan.sessions[idx];
    const hasContentPatch =
      patch?.focus !== undefined || patch?.note !== undefined || patch?.exercises !== undefined;
    const patched: Session = {
      ...existing,
      ...(patch?.focus !== undefined ? { focus: patch.focus } : {}),
      ...(patch?.note !== undefined ? { note: patch.note } : {}),
      ...(patch?.exercises !== undefined ? { exercises: patch.exercises } : {}),
      // Only reattribute provenance when content actually changed - a bare
      // lock/unlock toggle with no patch shouldn't erase where the existing
      // content came from (ai_schedule/ai_exercises/a prior reschedule).
      ...(hasContentPatch ? { source: "manual_edit" as const } : {}),
    };

    // Unlocking clears the manual lock outright, regardless of whether a
    // patch was also supplied in the same call. Any other save (a patch,
    // or an explicit `lock: true` with an empty patch) locks the session -
    // one edited day no longer freezes the whole plan, only that day.
    const updated: Session = unlock === true ? { ...patched, locked: false } : { ...patched, locked: true };

    const sessions = plan.sessions.map((s, i) => (i === idx ? updated : s));
    tx.set(planRef, { sessions }, { merge: true });
  });

  return { success: true };
});
