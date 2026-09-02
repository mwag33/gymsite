// Ranks a gym's machines by the user's own recent workout history so ad hoc
// logging can propose exercises instead of dropping the user into a blank
// tracker - see SessionTrackerPage's empty state. No AI call: this is a pure
// client-side rank over data the app already collects (machineStats), kept
// fast and free of any quota cost.
import type { Machine, MachineStats } from "../../lib/types";

const MAX_RECOMMENDATIONS = 6;

export interface RecommendedMachine {
  machine: Machine;
  source: "history" | "gym";
}

function toMillis(ts: unknown): number {
  return (ts as { toMillis?: () => number })?.toMillis?.() ?? 0;
}

/** Top machines by most-recently-used, falling back to the gym's plain
 * machine list when the user has no history yet at this gym (new user, or a
 * gym they've only just switched to) - so the strip is never blank. */
export function getRecommendedMachines(
  statsByMachineId: Record<string, MachineStats>,
  gymMachines: Machine[]
): RecommendedMachine[] {
  const machineById = new Map(gymMachines.map((m) => [m.id, m]));

  const historyRanked = Object.entries(statsByMachineId)
    .map(([machineId, stats]) => ({ machine: machineById.get(machineId), stats }))
    .filter((r): r is { machine: Machine; stats: MachineStats } => Boolean(r.machine))
    .sort((a, b) => toMillis(b.stats.lastUsedAt) - toMillis(a.stats.lastUsedAt))
    .slice(0, MAX_RECOMMENDATIONS)
    .map((r) => ({ machine: r.machine, source: "history" as const }));

  if (historyRanked.length > 0) return historyRanked;

  return gymMachines.slice(0, 8).map((machine) => ({ machine, source: "gym" as const }));
}
