// Default log-flow content: one compact row per planned exercise (icon,
// name, target sets/reps, a "same as last time" quick action, a
// mark-done/skip control), expanding into the shared SetEditor. A planned
// exercise resolves to a gym machine by exact case-insensitive name match
// (PlanExercise carries a name/category, not a machineId) — unmatched
// exercises fall back to "log via catalog" instead of guessing a machine.
import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { ExerciseEntry, Machine, MachineStats, Session } from "../../lib/types";
import { findCatalogMachine } from "../../lib/machineCatalog";
import MachineIcon from "../../components/MachineIcon";
import SetEditor, { summarizeSets } from "./SetEditor";

interface SessionLogListProps {
  uid: string;
  gymId: string;
  session: Session;
  onLogSomethingElse: () => void;
  onFinish: (exercises: ExerciseEntry[]) => Promise<void>;
  finishing: boolean;
  finishError: string | null;
}

const DEFAULT_SET = { reps: 10, weightKg: 20 };

export default function SessionLogList({
  uid,
  gymId,
  session,
  onLogSomethingElse,
  onFinish,
  finishing,
  finishError,
}: SessionLogListProps) {
  const exercises = session.exercises ?? [];
  const [machines, setMachines] = useState<Machine[]>([]);
  const [statsByExerciseId, setStatsByExerciseId] = useState<Record<string, MachineStats | null>>({});
  const [logged, setLogged] = useState<Record<string, ExerciseEntry>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftSets, setDraftSets] = useState<{ reps: number; weightKg: number }[]>([]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "gyms", gymId, "machines"), where("archived", "==", false)),
      (snap) => setMachines(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Machine))
    );
  }, [gymId]);

  const resolvedMachine = new Map<string, Machine>();
  for (const ex of exercises) {
    const match = machines.find((m) => m.name.trim().toLowerCase() === ex.name.trim().toLowerCase());
    if (match) resolvedMachine.set(ex.id, match);
  }

  useEffect(() => {
    const toFetch = exercises.filter(
      (ex) => resolvedMachine.has(ex.id) && !(ex.id in statsByExerciseId)
    );
    if (toFetch.length === 0) return;
    void Promise.all(
      toFetch.map(async (ex) => {
        const machine = resolvedMachine.get(ex.id)!;
        try {
          const snap = await getDoc(doc(db, "users", uid, "machineStats", machine.id));
          return [ex.id, snap.exists() ? (snap.data() as MachineStats) : null] as const;
        } catch {
          return [ex.id, null] as const;
        }
      })
    ).then((results) => {
      setStatsByExerciseId((prev) => {
        const next = { ...prev };
        for (const [id, stats] of results) next[id] = stats;
        return next;
      });
    });
    // machines/resolvedMachine are recomputed each render from `machines`; the
    // fetch-once guard above (checking statsByExerciseId membership) is what
    // actually prevents refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines, exercises]);

  function openEditor(exerciseId: string) {
    const stats = statsByExerciseId[exerciseId];
    const existing = logged[exerciseId];
    setDraftSets(
      existing
        ? existing.sets.map((s) => ({ ...s }))
        : stats?.lastSets?.length
          ? stats.lastSets.map((s) => ({ ...s }))
          : [{ ...DEFAULT_SET }]
    );
    setExpandedId(exerciseId);
  }

  function saveEditor(exerciseId: string) {
    const machine = resolvedMachine.get(exerciseId);
    if (!machine || draftSets.length === 0) return;
    setLogged((prev) => ({ ...prev, [exerciseId]: { machineId: machine.id, gymId, sets: draftSets } }));
    setExpandedId(null);
  }

  function quickSameAsLast(exerciseId: string) {
    const machine = resolvedMachine.get(exerciseId);
    const stats = statsByExerciseId[exerciseId];
    if (!machine || !stats?.lastSets?.length) return;
    setLogged((prev) => ({
      ...prev,
      [exerciseId]: { machineId: machine.id, gymId, sets: stats.lastSets.map((s) => ({ ...s })) },
    }));
  }

  function toggleSkip(exerciseId: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      return next;
    });
  }

  function removeLogged(exerciseId: string) {
    setLogged((prev) => {
      const next = { ...prev };
      delete next[exerciseId];
      return next;
    });
  }

  const loggedCount = Object.keys(logged).length;

  if (exercises.length === 0) {
    return (
      <div className="card log-empty-state">
        <p>No exercises planned for this session yet.</p>
        <button type="button" className="btn btn-secondary" onClick={onLogSomethingElse}>
          Log something else
        </button>
      </div>
    );
  }

  return (
    <div className="session-log-list">
      <ul className="session-log-rows">
        {exercises.map((ex) => {
          if (expandedId === ex.id) {
            return (
              <li key={ex.id}>
                <SetEditor
                  title={ex.name}
                  sets={draftSets}
                  onSetsChange={setDraftSets}
                  lastStats={statsByExerciseId[ex.id]}
                  onSave={() => saveEditor(ex.id)}
                  onClose={() => setExpandedId(null)}
                />
              </li>
            );
          }

          const entry = logged[ex.id];
          const isSkipped = skipped.has(ex.id);
          const machine = resolvedMachine.get(ex.id);
          const stats = statsByExerciseId[ex.id];
          const catalogMatch = findCatalogMachine(ex.name);

          return (
            <li
              key={ex.id}
              className={
                "session-log-row" +
                (entry ? " session-log-row-done" : "") +
                (isSkipped ? " session-log-row-skipped" : "")
              }
            >
              <MachineIcon iconId={catalogMatch?.id ?? ""} width={24} height={24} />
              <div className="session-log-row-info">
                <span className="session-log-row-name">{ex.name}</span>
                <span className="session-log-row-target tnum">
                  {entry
                    ? `Logged: ${summarizeSets(entry.sets)}`
                    : isSkipped
                      ? "Skipped"
                      : `${ex.sets} × ${ex.reps}`}
                </span>
                {!machine && !entry && !isSkipped && (
                  <span className="session-log-row-nomatch">Not in your gym's list</span>
                )}
              </div>

              <div className="session-log-row-actions">
                {entry ? (
                  <>
                    <button type="button" className="log-session-item-btn" onClick={() => openEditor(ex.id)}>
                      Edit
                    </button>
                    <button type="button" className="log-session-item-btn" onClick={() => removeLogged(ex.id)}>
                      Remove
                    </button>
                  </>
                ) : isSkipped ? (
                  <button type="button" className="log-session-item-btn" onClick={() => toggleSkip(ex.id)}>
                    Undo skip
                  </button>
                ) : machine ? (
                  <>
                    {stats?.lastSets?.length ? (
                      <button
                        type="button"
                        className="log-session-item-btn"
                        onClick={() => quickSameAsLast(ex.id)}
                      >
                        Same as last
                      </button>
                    ) : null}
                    <button type="button" className="log-session-item-btn" onClick={() => openEditor(ex.id)}>
                      Log
                    </button>
                    <button type="button" className="log-session-item-btn" onClick={() => toggleSkip(ex.id)}>
                      Skip
                    </button>
                  </>
                ) : (
                  <button type="button" className="log-session-item-btn" onClick={() => toggleSkip(ex.id)}>
                    Skip
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <button type="button" className="log-catalog-link" onClick={onLogSomethingElse}>
        Log something else
      </button>

      {finishError && <p className="log-error-text">{finishError}</p>}

      {loggedCount > 0 && (
        <button
          type="button"
          className="btn btn-primary log-finish-btn"
          disabled={finishing}
          onClick={() => void onFinish(Object.values(logged))}
        >
          {finishing ? "Saving..." : `Finish session (${loggedCount})`}
        </button>
      )}

      <style>{`
        .session-log-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .session-log-rows {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .session-log-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-3);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
        }
        .session-log-row-done {
          border-color: var(--success);
        }
        .session-log-row-skipped {
          opacity: 0.55;
        }
        .session-log-row-info {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }
        .session-log-row-name {
          font-size: 14px;
          font-weight: 600;
        }
        .session-log-row-target {
          font-size: 12px;
          color: var(--text-muted);
        }
        .session-log-row-nomatch {
          font-size: 11px;
          color: var(--danger);
        }
        .session-log-row-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: var(--space-2);
          flex-shrink: 0;
        }
        .log-catalog-link {
          align-self: flex-start;
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
        }
      `}</style>
    </div>
  );
}
