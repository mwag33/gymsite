// Ranks a gym's machines by the user's own recent workout history so a
// day's logging page can propose exercises instead of dropping the user
// into a blank tracker - see the day logging page's greyed suggestion strip.
// No AI call: this is a pure client-side rank over data the app already
// collects (machineStats), kept fast and free of any quota cost.
import type { Machine, MachineCategory, MachineStats } from "../../lib/types";

const MAX_RECOMMENDATIONS = 5;

export interface RecommendedMachine {
  machine: Machine;
  source: "history" | "gym";
}

function toMillis(ts: unknown): number {
  return (ts as { toMillis?: () => number })?.toMillis?.() ?? 0;
}

function rankByHistory(
  statsByMachineId: Record<string, MachineStats>,
  machineById: Map<string, Machine>
): Machine[] {
  return Object.entries(statsByMachineId)
    .map(([machineId, stats]) => ({ machine: machineById.get(machineId), stats }))
    .filter((r): r is { machine: Machine; stats: MachineStats } => Boolean(r.machine))
    .sort((a, b) => toMillis(b.stats.lastUsedAt) - toMillis(a.stats.lastUsedAt))
    .map((r) => r.machine);
}

/**
 * Top machines by most-recently-used, preferring ones matching the day's
 * assigned focus category (a Legs day suggests your usual leg machines
 * first), backfilling with unfiltered history and then the gym's plain
 * machine list when there isn't enough of a match - so the strip is never
 * blank and always tops out at MAX_RECOMMENDATIONS. `excludeMachineIds`
 * drops anything already added to the day, so suggestions keep refilling
 * from the next-best match as the user logs them.
 */
export function getRecommendedMachines(
  statsByMachineId: Record<string, MachineStats>,
  gymMachines: Machine[],
  category: MachineCategory | null,
  excludeMachineIds: Set<string> = new Set()
): RecommendedMachine[] {
  const machineById = new Map(gymMachines.map((m) => [m.id, m]));
  const historyRanked = rankByHistory(statsByMachineId, machineById).filter(
    (m) => !excludeMachineIds.has(m.id)
  );

  const seen = new Set<string>();
  const result: RecommendedMachine[] = [];

  function add(machine: Machine, source: RecommendedMachine["source"]) {
    if (seen.has(machine.id) || result.length >= MAX_RECOMMENDATIONS) return;
    seen.add(machine.id);
    result.push({ machine, source });
  }

  if (category) {
    for (const m of historyRanked) if (m.category === category) add(m, "history");
  }
  for (const m of historyRanked) add(m, "history");

  if (result.length < MAX_RECOMMENDATIONS) {
    const pool = category ? gymMachines.filter((m) => m.category === category) : gymMachines;
    for (const m of pool) {
      if (excludeMachineIds.has(m.id)) continue;
      add(m, "gym");
    }
  }
  if (result.length < MAX_RECOMMENDATIONS) {
    for (const m of gymMachines) {
      if (excludeMachineIds.has(m.id)) continue;
      add(m, "gym");
    }
  }

  return result;
}
