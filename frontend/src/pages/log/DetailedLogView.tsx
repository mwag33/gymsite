import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { MACHINE_CATEGORIES } from "../../lib/types";
import type {
  ExerciseEntry,
  Gym,
  Machine,
  MachineCategory,
  MachineStats,
  SetEntry,
} from "../../lib/types";

interface DetailedLogViewProps {
  uid: string;
  activeGym: (Gym & { id: string }) | null;
  onLogged: (logId: string) => void;
}

const DEFAULT_SET: SetEntry = { reps: 10, weightKg: 20 };
const WEIGHT_STEP = 2.5;
const REPS_STEP = 1;

const CATEGORY_LABELS: Record<MachineCategory, string> = {
  ...Object.fromEntries(MACHINE_CATEGORIES.map((c) => [c.value, c.label])),
  other: "Other",
} as Record<MachineCategory, string>;

const CATEGORY_ORDER: MachineCategory[] = [
  "chest",
  "back",
  "upper_body",
  "core",
  "legs",
  "cardio",
  "other",
];

function roundWeight(n: number): number {
  return Math.round(n * 10) / 10;
}

function summarizeSets(sets: SetEntry[]): string {
  return sets.map((s) => `${s.reps}×${s.weightKg}kg`).join(", ");
}

export function DetailedLogView({ uid, activeGym, onLogged }: DetailedLogViewProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [sessionExercises, setSessionExercises] = useState<ExerciseEntry[]>([]);
  const [activeMachine, setActiveMachine] = useState<Machine | null>(null);
  const [draftSets, setDraftSets] = useState<SetEntry[]>([]);
  const [lastStats, setLastStats] = useState<MachineStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGym) {
      setMachines([]);
      setMachinesLoading(false);
      return;
    }
    setMachinesLoading(true);
    const q = query(
      collection(db, "gyms", activeGym.id, "machines"),
      where("archived", "==", false)
    );
    return onSnapshot(q, (snap) => {
      setMachines(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Machine)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setMachinesLoading(false);
    });
  }, [activeGym]);

  if (!activeGym) {
    return (
      <div className="card log-no-gym">
        <p>Pick a gym to log detailed sets with exact weights and reps.</p>
        <Link to="/gym" className="btn btn-primary">
          Choose a gym
        </Link>
      </div>
    );
  }

  const gymId = activeGym.id;

  function machineName(machineId: string): string {
    return machines.find((m) => m.id === machineId)?.name ?? "Machine";
  }

  async function openMachine(machine: Machine) {
    setActiveMachine(machine);
    setError(null);
    const existing = sessionExercises.find((e) => e.machineId === machine.id);
    if (existing) {
      setDraftSets(existing.sets.map((s) => ({ ...s })));
      setLastStats(null);
      return;
    }
    setStatsLoading(true);
    try {
      const snap = await getDoc(doc(db, "users", uid, "machineStats", machine.id));
      const stats = snap.exists() ? (snap.data() as MachineStats) : null;
      setLastStats(stats);
      const last = stats?.lastSets[stats.lastSets.length - 1];
      setDraftSets([last ? { ...last } : { ...DEFAULT_SET }]);
    } catch {
      setLastStats(null);
      setDraftSets([{ ...DEFAULT_SET }]);
    } finally {
      setStatsLoading(false);
    }
  }

  function closePanel() {
    setActiveMachine(null);
    setDraftSets([]);
    setLastStats(null);
  }

  function adjustSet(index: number, field: "weightKg" | "reps", delta: number) {
    setDraftSets((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        if (field === "weightKg") {
          return { ...s, weightKg: Math.max(0, roundWeight(s.weightKg + delta)) };
        }
        return { ...s, reps: Math.max(1, s.reps + delta) };
      })
    );
  }

  function addSet() {
    setDraftSets((prev) => [...prev, prev.length > 0 ? { ...prev[prev.length - 1] } : { ...DEFAULT_SET }]);
  }

  function removeSet(index: number) {
    setDraftSets((prev) => prev.filter((_, i) => i !== index));
  }

  function applySameAsLastTime() {
    if (!lastStats) return;
    setDraftSets(lastStats.lastSets.map((s) => ({ ...s })));
  }

  function saveExercise() {
    if (!activeMachine || draftSets.length === 0) return;
    const entry: ExerciseEntry = {
      machineId: activeMachine.id,
      gymId,
      sets: draftSets.map((s) => ({ ...s })),
    };
    setSessionExercises((prev) => {
      const idx = prev.findIndex((e) => e.machineId === activeMachine.id);
      if (idx === -1) return [...prev, entry];
      const next = [...prev];
      next[idx] = entry;
      return next;
    });
    closePanel();
  }

  function removeExercise(machineId: string) {
    setSessionExercises((prev) => prev.filter((e) => e.machineId !== machineId));
  }

  async function handleFinish() {
    if (sessionExercises.length === 0 || finishing) return;
    setFinishing(true);
    setError(null);
    try {
      const ref = await addDoc(collection(db, "users", uid, "workoutLogs"), {
        mode: "detailed" as const,
        gymId,
        date: Timestamp.now(),
        exercises: sessionExercises,
        createdAt: serverTimestamp(),
      });
      setSessionExercises([]);
      onLogged(ref.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save your workout. Please try again."
      );
    } finally {
      setFinishing(false);
    }
  }

  const filteredMachines = machines.filter((m) =>
    m.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const grouped = new Map<MachineCategory, Machine[]>();
  for (const m of filteredMachines) {
    const list = grouped.get(m.category) ?? [];
    list.push(m);
    grouped.set(m.category, list);
  }

  return (
    <div className="log-detailed">
      {sessionExercises.length > 0 && (
        <div className="log-session-summary">
          <p className="log-session-summary-title">This workout</p>
          {sessionExercises.map((e) => (
            <div key={e.machineId} className="log-session-item">
              <span>
                {machineName(e.machineId)} &middot; {e.sets.length} set
                {e.sets.length === 1 ? "" : "s"}
              </span>
              <div className="log-session-item-actions">
                <button
                  type="button"
                  className="log-session-item-btn"
                  onClick={() => {
                    const machine = machines.find((m) => m.id === e.machineId);
                    if (machine) void openMachine(machine);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="log-session-item-btn"
                  onClick={() => removeExercise(e.machineId)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeMachine ? (
        <div className="card log-set-panel">
          <div className="log-set-panel-header">
            <p className="log-set-panel-title">{activeMachine.name}</p>
            <button
              type="button"
              className="log-panel-close"
              onClick={closePanel}
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          {statsLoading && <p className="log-status-muted">Loading last workout...</p>}

          {!statsLoading && lastStats && lastStats.lastSets.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary log-same-as-last-btn"
              onClick={applySameAsLastTime}
            >
              Same as last time ({summarizeSets(lastStats.lastSets)})
            </button>
          )}

          <div className="log-set-list">
            {draftSets.map((set, i) => (
              <div key={i} className="log-set-row">
                <span className="log-set-index">Set {i + 1}</span>
                <div className="log-stepper">
                  <button type="button" onClick={() => adjustSet(i, "weightKg", -WEIGHT_STEP)}>
                    &minus;
                  </button>
                  <span className="tnum log-stepper-value">{set.weightKg} kg</span>
                  <button type="button" onClick={() => adjustSet(i, "weightKg", WEIGHT_STEP)}>
                    +
                  </button>
                </div>
                <div className="log-stepper">
                  <button type="button" onClick={() => adjustSet(i, "reps", -REPS_STEP)}>
                    &minus;
                  </button>
                  <span className="tnum log-stepper-value">{set.reps} reps</span>
                  <button type="button" onClick={() => adjustSet(i, "reps", REPS_STEP)}>
                    +
                  </button>
                </div>
                {draftSets.length > 1 && (
                  <button
                    type="button"
                    className="log-set-remove"
                    onClick={() => removeSet(i)}
                    aria-label={`Remove set ${i + 1}`}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <button type="button" className="btn btn-secondary log-add-set-btn" onClick={addSet}>
            + Add set
          </button>

          {error && <p className="log-error-text">{error}</p>}

          <button
            type="button"
            className="btn btn-primary log-save-exercise-btn"
            onClick={saveExercise}
          >
            Save exercise
          </button>
        </div>
      ) : (
        <>
          <input
            type="search"
            className="log-search-input"
            placeholder="Search machines..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {machinesLoading && <p className="log-status-muted">Loading machines...</p>}

          {!machinesLoading && machines.length === 0 && (
            <div className="card log-empty-state">
              <p>No machines added for this gym yet.</p>
              <Link to="/gym" className="btn btn-secondary">
                Add machines
              </Link>
            </div>
          )}

          {!machinesLoading &&
            machines.length > 0 &&
            CATEGORY_ORDER.map((cat) => {
              const list = grouped.get(cat);
              if (!list || list.length === 0) return null;
              return (
                <div key={cat} className="log-machine-group">
                  <p className="log-machine-group-title">{CATEGORY_LABELS[cat]}</p>
                  <div className="log-machine-list">
                    {list.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="log-machine-row"
                        onClick={() => void openMachine(m)}
                      >
                        <span>{m.name}</span>
                        {sessionExercises.some((e) => e.machineId === m.id) && (
                          <span className="log-machine-added-badge">Added</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

          {error && <p className="log-error-text">{error}</p>}

          {sessionExercises.length > 0 && (
            <button
              type="button"
              className="btn btn-primary log-finish-btn"
              onClick={handleFinish}
              disabled={finishing}
            >
              {finishing ? "Saving..." : `Finish workout (${sessionExercises.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
