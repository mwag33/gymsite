// Typed wrappers around the backend's HTTPS callable Cloud Functions.
// Keep this the single place that knows the callable names/payload shapes so
// feature code never calls httpsCallable directly.
import { httpsCallable, type FunctionsErrorCode } from "firebase/functions";
import { functions } from "./firebase";
import type {
  ExperienceLevel,
  Goal,
  PlanDoc,
  Session,
  UserSettings,
} from "./types";

export interface AiRateLimitError extends Error {
  code: FunctionsErrorCode;
  isRateLimit: true;
}

function wrapCallableError(err: unknown): never {
  const fnErr = err as { code?: FunctionsErrorCode; message?: string };
  if (fnErr?.code === "functions/resource-exhausted") {
    const rateLimitError = new Error(
      fnErr.message || "Too many AI requests right now. Please try again later."
    ) as AiRateLimitError;
    rateLimitError.code = fnErr.code;
    rateLimitError.isRateLimit = true;
    throw rateLimitError;
  }
  if (fnErr?.code === "functions/unavailable") {
    throw new Error(
      fnErr.message ||
        "AI plan generation is temporarily paused. Please try again later."
    );
  }
  throw err;
}

export interface GenerateScheduleInput {
  goal: Goal;
  experience: ExperienceLevel;
  daysPerWeek: number;
  sessionLengthMinutes: number;
  gymId: string | null;
  equipmentNotes?: string;
  injuryNotes?: string;
  preferences?: string;
  units?: "metric" | "imperial";
  weekStartsOn?: number;
}

/** Generates (or refreshes) the ~28-day schedule. Returns the full plan doc. */
export async function generateSchedule(input: GenerateScheduleInput): Promise<PlanDoc> {
  try {
    const call = httpsCallable<GenerateScheduleInput, PlanDoc>(functions, "generateSchedule");
    const result = await call(input);
    return result.data;
  } catch (err) {
    wrapCallableError(err);
  }
}

export interface GenerateExercisesForWeekInput {
  experience: ExperienceLevel;
  sessionLengthMinutes: number;
  gymId: string | null;
  equipmentNotes?: string;
  injuryNotes?: string;
  preferences?: string;
}

/**
 * Fills the next unfilled ~7-day slice of exercises starting at the plan's
 * current `exerciseHorizon` and advances it. No `days` input — the server
 * reads `users/{uid}/plans/current` itself. Returns the updated plan doc.
 */
export async function generateExercisesForWeek(
  input: GenerateExercisesForWeekInput
): Promise<PlanDoc> {
  try {
    const call = httpsCallable<GenerateExercisesForWeekInput, PlanDoc>(
      functions,
      "generateExercisesForWeek"
    );
    const result = await call(input);
    return result.data;
  } catch (err) {
    wrapCallableError(err);
  }
}

export interface RegenerateSessionExercisesInput {
  sessionId: string;
  experience: ExperienceLevel;
  sessionLengthMinutes: number;
  gymId: string | null;
  equipmentNotes?: string;
  injuryNotes?: string;
  preferences?: string;
}

/** Regenerates exercises for exactly one session (e.g. after a manual focus swap). */
export async function regenerateSessionExercises(
  input: RegenerateSessionExercisesInput
): Promise<PlanDoc> {
  try {
    const call = httpsCallable<RegenerateSessionExercisesInput, PlanDoc>(
      functions,
      "regenerateSessionExercises"
    );
    const result = await call(input);
    return result.data;
  } catch (err) {
    wrapCallableError(err);
  }
}

export interface UpdateSessionInput {
  sessionId: string;
  patch?: Partial<Pick<Session, "focus" | "note" | "exercises">>;
  lock?: boolean;
  unlock?: boolean;
}

/** Patches a single session by id (never a whole-week array). */
export async function updateSession(input: UpdateSessionInput): Promise<void> {
  const call = httpsCallable<UpdateSessionInput, { success: boolean }>(functions, "updateSession");
  await call(input);
}

/**
 * Explicit/drift-prompted plan regeneration only — there is no more
 * automatic per-log AI regeneration. Returns the refreshed plan doc.
 */
export async function regeneratePlan(): Promise<PlanDoc> {
  try {
    const call = httpsCallable<void, PlanDoc>(functions, "regeneratePlan");
    const result = await call();
    return result.data;
  } catch (err) {
    wrapCallableError(err);
  }
}

export async function deleteAccount(): Promise<void> {
  const call = httpsCallable(functions, "deleteAccount");
  await call();
}

export async function exportUserData(): Promise<unknown> {
  const call = httpsCallable(functions, "exportUserData");
  const result = await call();
  return result.data;
}

export async function updateUserSettings(
  partialSettings: Partial<UserSettings>
): Promise<void> {
  const call = httpsCallable<{ settings: Partial<UserSettings> }, void>(
    functions,
    "updateUserSettings"
  );
  await call({ settings: partialSettings });
}

/** Adds a gym to the signed-in user's `homeGymIds` list (add-only, arrayUnion). */
export async function addHomeGym(gymId: string): Promise<void> {
  const call = httpsCallable<{ gymId: string }, { success: boolean }>(functions, "addHomeGym");
  await call({ gymId });
}
