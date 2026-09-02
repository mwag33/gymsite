import type { Timestamp } from "firebase-admin/firestore";

// Shared Firestore document shapes. These mirror the data model exactly;
// keep them in sync with firestore.rules (owned separately) and the client.

export interface UserSettings {
  units: "metric" | "imperial";
  weekStartsOn: number; // 0 = Sunday .. 6 = Saturday
  notificationsEnabled: boolean;
  activeGymId: string | null;
  logModeDefault: "simple" | "detailed";
  timezone: string; // IANA, e.g. "Europe/Berlin" - drives the daily sweep's "today" and date stamping
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
  // FK to Session.id, set once by the client at log-create time. Null for a
  // free-form log with no scheduled session behind it. Never stamped after
  // creation - logs stay append-only/immutable.
  plannedSessionId: string | null;
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

export type SessionStatus = "upcoming" | "done" | "partial" | "skipped" | "swapped";

// A session's provenance - lets the engine and any future debugging tell
// whether a given day came from the AI schedule call, the AI exercise-fill
// call, the deterministic rebalancer absorbing a miss, or a manual edit.
export type SessionSource =
  | "ai_schedule"
  | "ai_exercises"
  | "deterministic_reschedule"
  | "manual_edit"
  | "manual_reschedule";

export interface Session {
  // Stable id, survives reschedules - the FK target for WorkoutLogDoc.plannedSessionId.
  // Never derive this from date/index; dates can move (rebalance), ids don't.
  id: string;
  date: string; // "YYYY-MM-DD", user-local calendar date (see UserSettings.timezone)
  focus: TrainingPlanFocus;
  note: string;
  // null = outside the exercise horizon (schedule-only so far), [] = rest day
  // (deliberately empty, not "not yet generated"), non-empty = ready to log.
  exercises: PlanExercise[] | null;
  status: SessionStatus;
  // Manual per-session lock, set only via updateSession. Replaces the old
  // plan-wide exercisesLocked flag - one edited day no longer freezes the
  // whole plan.
  locked: boolean;
  source: SessionSource;
  loggedAt?: Timestamp | null;
  // What was actually logged, when status === "swapped" and it differs from `focus`.
  swappedFocus?: TrainingPlanFocus | null;
  // Idempotency marker: when the deterministic rebalancer absorbs a missed
  // session into this one, it stamps the source session's id here so a
  // redelivered trigger/sweep event recognizes the rebalance already happened.
  rescheduledFromSessionId?: string | null;
}

export interface PlanDoc {
  planId: string; // increments on each full schedule regeneration, groups archived history
  timezone: string; // IANA, copied from UserSettings at generation time
  scheduleGeneratedAt: Timestamp;
  scheduleModelVersion: string;
  exercisesModelVersion: string | null;
  frequencyPerWeek: number;
  exerciseHorizon: string; // "YYYY-MM-DD" - sessions on/before this date have exercises filled
  needsScheduleRefresh: boolean; // set by the daily sweep on adherence drift; client offers a refresh
  sessions: Session[]; // rolling window (~6 weeks), sorted by date ascending
  lastSweepAt: Timestamp;
}

export interface FeatureFlagsDoc {
  aiGenerationEnabled: boolean;
}
