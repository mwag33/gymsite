// Client-supplied hero art for TodayHero's single-focus card, one per
// training focus (frontend/public/focus-images/, sourced from images/ at
// the repo root). No image exists for "upper_body" or "other" - upper_body
// falls back to the back shot (upper-body day training most commonly
// includes back work in this app's AI-generated split), "other" stays
// icon-only rather than guessing a stand-in photo.
import type { TrainingPlanFocus } from "../../lib/types";

export const FOCUS_IMAGE: Partial<Record<TrainingPlanFocus, string>> = {
  chest: "/focus-images/chest.webp",
  back: "/focus-images/back.webp",
  legs: "/focus-images/legs.webp",
  core: "/focus-images/core.webp",
  cardio: "/focus-images/cardio.webp",
  rest: "/focus-images/rest.webp",
  upper_body: "/focus-images/back.webp",
};
