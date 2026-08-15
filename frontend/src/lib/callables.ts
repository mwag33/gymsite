// Typed wrappers around the backend's HTTPS callable Cloud Functions.
// Keep this the single place that knows the callable names/payload shapes so
// feature code never calls httpsCallable directly.
import { httpsCallable, type FunctionsErrorCode } from "firebase/functions";
import { functions } from "./firebase";
import type {
  ExperienceLevel,
  Goal,
  TrainingPlan,
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

export interface GenerateInitialPlanInput {
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

export async function generateInitialPlan(
  input: GenerateInitialPlanInput
): Promise<TrainingPlan> {
  try {
    const call = httpsCallable<GenerateInitialPlanInput, TrainingPlan>(
      functions,
      "generateInitialPlan"
    );
    const result = await call(input);
    return result.data;
  } catch (err) {
    wrapCallableError(err);
  }
}

export async function recalculatePlan(logId: string): Promise<TrainingPlan> {
  try {
    const call = httpsCallable<{ logId: string }, TrainingPlan>(
      functions,
      "recalculatePlan"
    );
    const result = await call({ logId });
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
