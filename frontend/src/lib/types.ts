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
export type SessionSource =
  | "ai_schedule"
  | "ai_exercises"
  | "deterministic_reschedule"
  | "manual_edit"
  | "manual_reschedule";

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

// A TrackedSession is the client-owned, mutable record of what a user is
// actually doing/did, as opposed to Session (above), which is only ever a
// server-generated suggestion inside PlanDoc.sessions[]. Unlike Session,
// TrackedSession is id-keyed (not date-keyed) so multiple sessions can exist
// on the same calendar date, and it is user-creatable on any date (including
// past dates) rather than only AI-generated. See firestore.rules for the
// validation this trades an append-only guarantee for.
export type TrackedSessionStatus = "in_progress" | "done";
// "logged" does NOT imply sets.length > 0: a no-active-gym session (see
// SessionTrackerPage's gymId === null category-tap flow) logs a bare
// category with machineId: null and sets: []. Anything computing volume/sets
// from TrackedExercise must check `status`, not `sets.length`, to know
// whether an exercise was actually done.
export type TrackedExerciseStatus = "pending" | "logged" | "skipped";

export interface TrackedExercise {
  id: string;
  name: string;
  machineId: string | null;
  gymId: string | null;
  machineCategory: MachineCategory;
  targetSets?: number;
  targetReps?: string;
  // Carried over from PlanExercise.targetMuscles when accepting a suggestion,
  // or best-effort from the machine catalog when a machine is picked. Absent
  // on older docs and on custom machines with no catalog match - display-only,
  // never required.
  targetMuscles?: MuscleGroup[];
  sets: SetEntry[];
  status: TrackedExerciseStatus;
}

export interface TrackedSession {
  id: string;
  date: string; // "YYYY-MM-DD", user-local calendar date
  focus: TrainingPlanFocus;
  note: string;
  gymId: string | null;
  exercises: TrackedExercise[];
  status: TrackedSessionStatus;
  // FK to Session.id, set once at creation via the "accept a suggestion"
  // flow. Null for a session the user created from scratch (ad hoc or
  // backdated logging with no corresponding plan suggestion).
  sourcePlanSessionId: string | null;
  createdAt: unknown; // Firestore Timestamp
  updatedAt: unknown; // Firestore Timestamp, bumped on every autosave write
  // Last time the invisible workoutLogs sync event fired for this session
  // (see useAutosaveTrackedSession) - null until the first set is saved.
  lastSyncedLogAt: unknown | null;
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
