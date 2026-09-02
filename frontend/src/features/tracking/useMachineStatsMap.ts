// A single source of "what machines has this user actually been doing" for
// a gym: feeds both the ad hoc recommendation strip (recommendedExercises.ts)
// and the tracker's per-exercise "same as last time" lookup, replacing two
// separate machineStats reads that used to exist for those two purposes.
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { MachineStats } from "../../lib/types";

export function useMachineStatsMap(
  uid: string | undefined,
  gymId: string | null | undefined
): Record<string, MachineStats> {
  const [statsByMachineId, setStatsByMachineId] = useState<Record<string, MachineStats>>({});

  useEffect(() => {
    if (!uid || !gymId) {
      setStatsByMachineId({});
      return;
    }
    return onSnapshot(collection(db, "users", uid, "machineStats"), (snap) => {
      const next: Record<string, MachineStats> = {};
      for (const d of snap.docs) {
        const data = d.data() as MachineStats;
        if (data.gymId === gymId) next[d.id] = data;
      }
      setStatsByMachineId(next);
    });
  }, [uid, gymId]);

  return statsByMachineId;
}
