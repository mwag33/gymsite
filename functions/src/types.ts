import type { Timestamp } from "firebase-admin/firestore";

// Shared Firestore document shapes. These mirror the data model exactly;
// keep them in sync with firestore.rules (owned separately) and the client.

export interface UserSettings {
  units: "metric" | "imperial";
  weekStartsOn: number; // 0 = Sunday .. 6 = Saturday
  notificationsEnabled: boolean;
  activeGymId: string | null;
  logModeDefault: "simple" | "detailed";
}

export const ALLOWED_USER_SETTINGS_KEYS: (keyof UserSettings)[] = [
  "units",
  "weekStartsOn",
  "notificationsEnabled",
  "activeGymId",
  "logModeDefault",
];

export interface UserDoc {
  displayName: string | null;
  email: string | null;
  authProvider: "google" | "password";
  createdAt: Timestamp;
  goal: string | null;
  goalUpdatedAt: Timestamp | null;
  homeGymIds: string[];
  settings: UserSettings;
  emailVerified: boolean;
}

export interface AiQuotaDoc {
  dailyCount: number;
  windowStartedAt: Timestamp;
  dailyLimit: number;
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

export interface TrainingPlanDay {
  dayIndex: number;
  focus: TrainingPlanFocus;
  note: string;
}

export interface TrainingPlanDoc {
  generatedAt: Timestamp;
  basedOnLogId: string | null;
  weekStart: Timestamp;
  frequencyPerWeek: number;
  days: TrainingPlanDay[];
  modelVersion: string;
}

export interface FeatureFlagsDoc {
  aiGenerationEnabled: boolean;
}
