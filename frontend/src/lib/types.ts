// Mirrors the Firestore data model — kept in sync with functions/src/types.ts and firestore.rules.

export type Goal =
  | "allround_strength"
  | "upper_body"
  | "lower_body"
  | "cardio"
  | "custom";

export type ExperienceLevel = "new" | "some_experience" | "experienced";

export type MachineCategory =
  | "chest"
  | "back"
  | "legs"
  | "core"
  | "cardio"
  | "upper_body"
  | "other";

export type WorkoutMode = "simple" | "detailed";

export interface UserSettings {
  units: "metric" | "imperial";
  weekStartsOn: number; // 0 = Sunday .. 6 = Saturday
  notificationsEnabled: boolean;
  activeGymId: string | null;
  logModeDefault: WorkoutMode;
  timezone: string; // IANA, e.g. "Europe/Berlin"
}

export interface UserProfile {
  displayName: string | null;
  email: string | null;
  authProvider: "google" | "password";
  createdAt: unknown; // Firestore Timestamp
  goal: Goal | null;
  goalUpdatedAt: unknown | null;
  experienceLevel: ExperienceLevel | null;
  daysPerWeek: number | null;
  sessionLengthMinutes: number | null;
  equipmentNotes: string | null;
  injuryNotes: string | null;
  homeGymIds: string[];
  settings: UserSettings;
  emailVerified: boolean;
}

export interface Gym {
  id: string;
  name: string;
  createdBy: string;
  createdAt: unknown;
  memberCount: number;
  location: { city: string; country: string } | null;
}

export interface Machine {
  id: string;
  name: string;
  category: MachineCategory;
  addedBy: string;
  createdAt: unknown;
  archived: boolean;
}

export interface SetEntry {
  reps: number;
  weightKg: number;
}

export interface ExerciseEntry {
  machineId: string;
  gymId: string;
  sets: SetEntry[];
}

export interface WorkoutLog {
  id: string;
  mode: WorkoutMode;
  gymId: string | null;
  date: unknown;
  bodyParts?: MachineCategory[];
  exercises?: ExerciseEntry[];
  createdAt: unknown;
  // FK to Session.id, set once at creation. Null for a free-form log not tied
  // to any scheduled session.
  plannedSessionId: string | null;
}

export interface MachineStats {
  gymId: string;
  lastUsedAt: unknown;
  lastSets: SetEntry[];
  bestWeightKg: number;
  totalSessions: number;
}

export interface MachineStatsHistoryEntry {
  id: string;
  date: unknown;
  sets: SetEntry[];
  sourceLogId: string;
}

// Matches MachineCategory plus "rest" so a session maps directly onto a
// simple-mode logging category (see functions/src/gemini.ts).
export type TrainingPlanFocus = MachineCategory | "rest";

// Finer-grained than MachineCategory - used only for the plan's per-exercise
// muscle-diagram visualization, not for logging or machine categorization.
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
  reps: string; // prescriptive, e.g. "8-12" or "30s" - not a logged rep count
  targetMuscles: MuscleGroup[];
  machineCategory: MachineCategory;
  note?: string;
}

export type SessionStatus = "upcoming" | "done" | "partial" | "skipped" | "swapped";
export type SessionSource = "ai_schedule" | "ai_exercises" | "deterministic_reschedule" | "manual_edit";

export interface Session {
  id: string; // stable id, survives reschedules - the FK target for WorkoutLog.plannedSessionId
  date: string; // "YYYY-MM-DD", user-local calendar date
  focus: TrainingPlanFocus;
  note: string;
  // null = outside the exercise horizon, [] = rest day, non-empty = ready to log
  exercises: PlanExercise[] | null;
  status: SessionStatus;
  locked: boolean; // manual per-session lock, set via updateSession
  source: SessionSource;
  loggedAt?: unknown | null;
  swappedFocus?: TrainingPlanFocus | null;
  rescheduledFromSessionId?: string | null;
}

export interface PlanDoc {
  planId: string;
  timezone: string;
  scheduleGeneratedAt: unknown;
  scheduleModelVersion: string;
  exercisesModelVersion: string | null;
  frequencyPerWeek: number;
  exerciseHorizon: string; // "YYYY-MM-DD"
  needsScheduleRefresh: boolean;
  sessions: Session[];
  lastSweepAt: unknown;
}

export const MACHINE_CATEGORIES: { value: MachineCategory; label: string }[] = [
  { value: "chest", label: "Chest" },
  { value: "back", label: "Back" },
  { value: "upper_body", label: "Upper Body" },
  { value: "core", label: "Core" },
  { value: "legs", label: "Legs" },
  { value: "cardio", label: "Cardio" },
  { value: "other", label: "Other" },
];

export const GOAL_OPTIONS: { value: Goal; label: string; description: string }[] = [
  { value: "allround_strength", label: "Allround strength", description: "Balanced full-body strength training" },
  { value: "upper_body", label: "Upper body strength", description: "Chest, back, shoulders, arms focus" },
  { value: "lower_body", label: "Lower body strength", description: "Legs and glutes focus" },
  { value: "cardio", label: "Cardio & conditioning", description: "Endurance and cardiovascular fitness" },
  { value: "custom", label: "Something else", description: "Tell us in your own words" },
];
