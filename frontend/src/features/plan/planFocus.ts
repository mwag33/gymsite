// Shared by PlanReveal, PlanEditor and OnboardingFlow so none of them need to
// import from each other just for this lookup.
import type { TrainingPlanFocus } from "../../lib/types";

export const FOCUS_LABELS: Record<TrainingPlanFocus, string> = {
  chest: "Chest",
  back: "Back",
  legs: "Legs",
  core: "Core",
  cardio: "Cardio",
  upper_body: "Upper Body",
  other: "Other",
  rest: "Rest day",
};

// Excludes "other" - the AI/schema/validation stack only ever uses these 7
// values for a plan day's focus (see functions/src/gemini.ts FOCUS_ENUM and
// functions/src/updateTrainingPlan.ts FOCUS_VALUES).
export const EDITABLE_FOCUS_OPTIONS: TrainingPlanFocus[] = [
  "rest",
  "chest",
  "back",
  "legs",
  "core",
  "cardio",
  "upper_body",
];
