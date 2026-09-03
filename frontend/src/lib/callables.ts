// Typed wrappers around the backend's HTTPS callable Cloud Functions.
// Keep this the single place that knows the callable names/payload shapes so
// feature code never calls httpsCallable directly.
import { httpsCallable, type FunctionsErrorCode } from "firebase/functions";
import { functions } from "./firebase";
import type {
  DraftDay,
  ExperienceLevel,
  Goal,
  PlanExercise,
  TrainingPlanFocus,
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

/** Onboarding-only: generates the reviewed draft week (7 days, day 0 =
 * today). Stateless - nothing is persisted beyond basic profile fields. */
export async function generateSchedule(input: GenerateScheduleInput): Promise<{ days: DraftDay[] }> {
  try {
    const call = httpsCallable<GenerateScheduleInput, { days: DraftDay[] }>(functions, "generateSchedule");
    const result = await call(input);
    return result.data;
  } catch (err) {
    wrapCallableError(err);
  }
}

export interface GenerateExercisesForWeekInput {
  days: { id: string; focus: TrainingPlanFocus }[];
  experience: ExperienceLevel;
  sessionLengthMinutes: number;
  gymId: string | null;
  equipmentNotes?: string;
  injuryNotes?: string;
  preferences?: string;
}

/** Onboarding-only: proposes exercises for the client-supplied draft week. */
export async function generateExercisesForWeek(
  input: GenerateExercisesForWeekInput
): Promise<{ exercisesById: Record<string, PlanExercise[]> }> {
  try {
    const call = httpsCallable<GenerateExercisesForWeekInput, { exercisesById: Record<string, PlanExercise[]> }>(
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
  dayId: string;
  focus: TrainingPlanFocus;
  experience: ExperienceLevel;
  sessionLengthMinutes: number;
  gymId: string | null;
  equipmentNotes?: string;
  injuryNotes?: string;
  preferences?: string;
}

/** Onboarding-only: regenerates exercises for exactly one draft day. */
export async function regenerateSessionExercises(
  input: RegenerateSessionExercisesInput
): Promise<{ exercises: PlanExercise[] }> {
  try {
    const call = httpsCallable<RegenerateSessionExercisesInput, { exercises: PlanExercise[] }>(
      functions,
      "regenerateSessionExercises"
    );
    const result = await call(input);
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
