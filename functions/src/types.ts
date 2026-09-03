import type { Timestamp } from "firebase-admin/firestore";

// Shared Firestore document shapes. These mirror the data model exactly;
// keep them in sync with firestore.rules (owned separately) and the client.

export interface UserSettings {
  units: "metric" | "imperial";
  weekStartsOn: number; // 0 = Sunday .. 6 = Saturday
  notificationsEnabled: boolean;
  activeGymId: string | null;
  logModeDefault: "simple" | "detailed";
  timezone: string; // IANA, e.g. "Europe/Berlin" - drives "day 0 = today" in onboarding's schedule generation
}

export const ALLOWED_USER_SETTINGS_KEYS: (keyof UserSettings)[] = [
  "units",
  "weekStartsOn",
  "notificationsEnabled",
  "activeGymId",
  "logModeDefault",
  "timezone",
];

export interface UserDoc {
  displayName: string | null;
  email: string | null;
  authProvider: "google" | "password";
  createdAt: Timestamp;
  goal: string | null;
  goalUpdatedAt: Timestamp | null;
  experienceLevel: string | null;
  daysPerWeek: number | null;
  sessionLengthMinutes: number | null;
  equipmentNotes: string | null;
  injuryNotes: string | null;
  homeGymIds: string[];
  settings: UserSettings;
  emailVerified: boolean;
  // Repeating default focus per weekday (index 0 = Sunday .. 6 = Saturday),
  // written once at onboarding finish alongside the first week's daySessions
  // docs. Null until onboarding completes.
  weeklyFocusPattern: TrainingPlanFocus[] | null;
}

// No dailyLimit field here on purpose: the cap is a code constant
// (functions/src/quota.ts's DEFAULT_DAILY_LIMIT), not a per-user stored
// value, so changing it takes effect for every user immediately rather than
// only for quota docs created after the change.
export interface AiQuotaDoc {
  dailyCount: number;
  windowStartedAt: Timestamp;
}

export interface GymDoc {
  name: string;
  createdBy: string;
  createdAt: Timestamp;
  memberCount: number;
  location: { city: string; country: string } | null;
}

export type MachineCategory =
  | "chest"
  | "back"
  | "legs"
  | "core"
  | "cardio"
  | "upper_body"
  | "other";

export interface MachineDoc {
  name: string;
  category: MachineCategory;
  addedBy: string;
  createdAt: Timestamp;
  archived: boolean;
}

export interface SetEntry {
  reps: number;
  weightKg: number;
}

export interface WorkoutLogExercise {
  machineId: string;
  gymId: string;
  sets: SetEntry[];
}

export interface WorkoutLogDoc {
  mode: "simple" | "detailed";
  gymId: string | null;
  date: Timestamp;
  bodyParts?: string[];
  exercises?: WorkoutLogExercise[];
  createdAt: Timestamp;
}

export interface MachineStatsDoc {
  gymId: string;
  lastUsedAt: Timestamp;
  lastSets: SetEntry[];
  bestWeightKg: number;
  totalSessions: number;
}

export interface MachineStatsHistoryEntry {
  date: Timestamp;
  sets: SetEntry[];
  sourceLogId: string;
}

export type TrainingPlanFocus =
  | "chest"
  | "back"
  | "legs"
  | "core"
  | "cardio"
  | "upper_body"
  | "rest";

// Finer-grained than MachineCategory - used only for the plan's per-exercise
// muscle-diagram visualization on the client, not for logging or categorization.
export type MuscleGroup =
  | "chest"
  | "upper_back"
  | "lats"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "obliques"
  | "glutes"
  | "quads"
  | "hamstrings"
  | "calves"
  | "cardio";

export interface PlanExercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  targetMuscles: MuscleGroup[];
  machineCategory: MachineCategory;
  note?: string;
}

// A single day of onboarding's draft week - the request/response shape for
// generateSchedule / generateExercisesForWeek / regenerateSessionExercises.
// Stateless: these callables read and write nothing in Firestore beyond the
// user profile: the client holds the draft week in local state for the
// duration of the wizard and materializes it into real `daySessions` docs
// itself once the user finishes (see dayActions.ts on the
// client). No PlanDoc, no rolling window, no server-side draft persistence.
export interface DraftDay {
  id: string;
  date: string; // "YYYY-MM-DD", user-local calendar date (see UserSettings.timezone)
  focus: TrainingPlanFocus;
  note: string;
  exercises: PlanExercise[] | null; // null = not generated yet
}

export interface FeatureFlagsDoc {
  aiGenerationEnabled: boolean;
}
