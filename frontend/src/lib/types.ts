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
  // The repeating default focus for each weekday (index 0 = Sunday .. 6 =
  // Saturday, matching UserSettings.weekStartsOn's convention), generated at
  // onboarding. A day with no daySessions doc yet displays
  // weeklyFocusPattern[date.getDay()] as its unconfirmed default; the doc
  // only materializes once the user changes that day's type or logs
  // something on it. Null until onboarding completes.
  weeklyFocusPattern: TrainingPlanFocus[] | null;
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

// A single day within onboarding's AI-generated draft week - never persisted
// on its own, held in the wizard's local state and only materialized (via
// materializeOnboardingWeek in dayActions.ts) into real
// `daySessions` docs plus a UserProfile.weeklyFocusPattern once the user
// finishes onboarding. `id` only needs to be stable within one onboarding
// session (React keys, correlating a regenerate-exercises call to its row).
export interface DraftDay {
  id: string;
  date: string; // "YYYY-MM-DD"
  focus: TrainingPlanFocus;
  note: string;
  exercises: PlanExercise[] | null; // null = not generated yet
}

// "logged" does NOT imply sets.length > 0: a no-active-gym session (see
// the day page's gymId === null category-tap flow) logs a bare category with
// machineId: null and sets: []. Anything computing volume/sets from
// TrackedExercise must check `status`, not `sets.length`, to know whether an
// exercise was actually done.
export type TrackedExerciseStatus = "pending" | "logged" | "skipped";

export interface TrackedExercise {
  id: string;
  name: string;
  machineId: string | null;
  gymId: string | null;
  machineCategory: MachineCategory;
  targetSets?: number;
  targetReps?: string;
  // Carried over from PlanExercise.targetMuscles when materializing an
  // onboarding suggestion, or best-effort from the machine catalog when a
  // machine is picked. Absent on custom machines with no catalog match -
  // display-only, never required.
  targetMuscles?: MuscleGroup[];
  sets: SetEntry[];
  status: TrackedExerciseStatus;
  // Stamped the first time this exercise crosses into status "logged" - the
  // dedupe marker for the workoutLogs/machineStats sync (see
  // dayActions.ts's syncLoggedExercise). Re-editing an
  // already-logged exercise's sets later updates `sets` but must not re-fire
  // the sync, or machineStats.totalSessions would inflate on every edit.
  firstLoggedAt?: unknown | null;
}

// The single record of a calendar day, replacing the old
// PlanDoc/Session/TrackedSession split: one mutable, date-keyed document per
// day (doc ID = date), always editable, no accept-gating and no
// plan-vs-actual bookkeeping. A day with no doc yet falls back to
// UserProfile.weeklyFocusPattern for its default focus (see
// dayFocusFor in dayActions.ts).
export interface DaySession {
  date: string; // "YYYY-MM-DD", user-local calendar date - also the doc ID
  focus: TrainingPlanFocus;
  gymId: string | null;
  exercises: TrackedExercise[];
  createdAt: unknown; // Firestore Timestamp
  updatedAt: unknown; // Firestore Timestamp, bumped on every autosave write
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
