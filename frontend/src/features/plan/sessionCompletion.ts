// Resolves which planned exercises in a session were actually logged, for
// SessionExerciseRow's per-exercise completion indicator. Mirrors (at UI
// review granularity, not adherence-authoritative) the category-level
// matching philosophy in the plan's adherence engine: a detailed-mode log
// resolves per-exercise by machine name; a simple-mode log only carries a
// body-part category, so every planned exercise in that category is treated
// as covered — coarser, but the same idea as the backend's 70% threshold.
import type { Machine, PlanExercise, SetEntry, WorkoutLog } from "../../lib/types";
import { findCatalogMachine } from "../../lib/machineCatalog";

export interface ExerciseCompletion {
  done: boolean;
  loggedSets: SetEntry[] | null; // null when matched only at category level (simple mode)
}

/**
 * `logs` should already be scoped to this one session (filtered by
 * `plannedSessionId === session.id` by the caller). `machines` resolves a
 * detailed log's `machineId` back to a display name so it can be matched
 * against the plan's exercise names.
 */
export function resolveSessionCompletion(
  exercises: PlanExercise[],
  logs: WorkoutLog[],
  machines: Machine[]
): Map<string, ExerciseCompletion> {
  const result = new Map<string, ExerciseCompletion>();
  const machineById = new Map(machines.map((m) => [m.id, m]));

  const loggedSetsByName = new Map<string, SetEntry[]>();
  const loggedCategories = new Set<string>();

  for (const log of logs) {
    if (log.mode === "detailed" && log.exercises) {
      for (const entry of log.exercises) {
        const machine = machineById.get(entry.machineId);
        if (machine) {
          loggedSetsByName.set(machine.name.trim().toLowerCase(), entry.sets);
          loggedCategories.add(machine.category);
        }
      }
    } else if (log.mode === "simple" && log.bodyParts) {
      for (const part of log.bodyParts) loggedCategories.add(part);
    }
  }

  for (const ex of exercises) {
    const nameKey = ex.name.trim().toLowerCase();
    const catalogCategory = findCatalogMachine(ex.name)?.category ?? ex.machineCategory;
    if (loggedSetsByName.has(nameKey)) {
      result.set(ex.id, { done: true, loggedSets: loggedSetsByName.get(nameKey) ?? null });
    } else if (loggedCategories.has(ex.machineCategory) || loggedCategories.has(catalogCategory)) {
      result.set(ex.id, { done: true, loggedSets: null });
    } else {
      result.set(ex.id, { done: false, loggedSets: null });
    }
  }

  return result;
}
