// Derives "what was actually trained" from real exercises, instead of
// reading the single focus value frozen onto a Session/TrackedSession at
// creation time. Display-only: nothing here is persisted, and none of it
// feeds the server-side adherence logic in functions/src/planEngine.ts,
// which keeps comparing against the plain `focus`/`machineCategory` fields
// exactly as before.
import type { MachineCategory, MuscleGroup, TrackedExercise, TrainingPlanFocus } from "../../lib/types";
import { MACHINE_CATEGORIES } from "../../lib/types";
import { findCatalogMachine } from "../../lib/machineCatalog";

const CATEGORY_ORDER = new Map(MACHINE_CATEGORIES.map((c, i) => [c.value, i]));

/** Distinct machine categories among exercises that have at least one logged
 * set - not `machineId` resolved, since an unmatched planned exercise still
 * carries a category and shouldn't vanish from the tag set just because
 * auto-resolve hasn't matched it to a real gym machine yet. Falls back to
 * including "other" only when nothing else is present. */
export function deriveLoggedCategories(exercises: TrackedExercise[]): MachineCategory[] {
  // "logged" - not "has sets": a no-gym category tap (see
  // SessionTrackerPage's gymId === null branch) resolves with zero sets but
  // status "logged", and must still count toward what was actually done.
  const logged = exercises.filter((ex) => ex.status === "logged");
  const categories = Array.from(new Set(logged.map((ex) => ex.machineCategory)));
  const real = categories.filter((c) => c !== "other");
  const result = real.length > 0 ? real : categories;
  return result.slice().sort((a, b) => (CATEGORY_ORDER.get(a) ?? 0) - (CATEGORY_ORDER.get(b) ?? 0));
}

/** Best-effort distinct muscle groups among logged exercises: prefers each
 * exercise's own `targetMuscles` (carried over from an accepted plan
 * suggestion), falling back to the machine catalog's `primaryMuscles` by
 * exact name match when absent (custom/older exercises with no stored
 * muscle data). Purely a secondary display line - absence is expected and
 * fine, never a validation error. */
export function deriveLoggedMuscles(exercises: TrackedExercise[]): MuscleGroup[] {
  const logged = exercises.filter((ex) => ex.status === "logged");
  const muscles = new Set<MuscleGroup>();
  for (const ex of logged) {
    const fromExercise = ex.targetMuscles ?? findCatalogMachine(ex.name)?.primaryMuscles ?? [];
    for (const m of fromExercise) muscles.add(m);
  }
  return Array.from(muscles);
}

/** Per-session tags for surfaces that show one tracked session at a time
 * (SessionTrackerPage header, a DayDetailPage tracked card, TodayHero):
 * actual logged categories once anything's logged, else the session's own
 * frozen `focus` seed (skipped entirely for the "other"/"rest" placeholder
 * values, which render as the empty/"New session" state instead of a
 * misleading label). */
export function deriveSessionFocusTags(session: {
  exercises: TrackedExercise[];
  focus: TrainingPlanFocus;
}): { categories: MachineCategory[]; muscles: MuscleGroup[] } {
  const logged = deriveLoggedCategories(session.exercises);
  if (logged.length > 0) {
    return { categories: logged, muscles: deriveLoggedMuscles(session.exercises) };
  }
  if (session.focus === "other" || session.focus === "rest") {
    return { categories: [], muscles: [] };
  }
  return { categories: [session.focus], muscles: [] };
}

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  upper_back: "Upper Back",
  lats: "Lats",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
  cardio: "Cardio",
};
