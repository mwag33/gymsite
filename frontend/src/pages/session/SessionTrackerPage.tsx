// The tracked-session editor, at /session/:sessionId. Replaces the old
// SessionLogList + LogWorkoutPage.handleFinishSession flow: every set change
// autosaves (see useAutosaveTrackedSession) instead of an explicit
// "Save exercise" / "Finish session" button. Exercises render as a
// horizontally-scrollable card carousel (bright-mode visual pass) instead of
// the old dense vertical row list.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, onSnapshot, collection } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import type { Machine, MachineStats, TrackedExercise } from "../../lib/types";
import { findCatalogMachine } from "../../lib/machineCatalog";
import MachineIcon from "../../components/MachineIcon";
import MachinePicker from "../../components/MachinePicker";
import PlateRing from "../../components/PlateRing";
import Sheet from "../../components/Sheet";
import SetEditor, { summarizeSets } from "../log/SetEditor";
import { useAutosaveTrackedSession } from "../../features/tracking/useAutosaveTrackedSession";
import { computeTrackedSessionStatus } from "../../features/tracking/trackedSessionActions";
import { weekdayLabel, shortDateLabel } from "../../features/plan/planDate";
import { FOCUS_LABELS } from "../../features/plan/planFocus";
import { FocusIcon } from "../../features/plan/focusIcons";

function patchExercise(
  exercises: TrackedExercise[],
  id: string,
  patch: Partial<TrackedExercise>
): TrackedExercise[] {
  return exercises.map((ex) => (ex.id === id ? { ...ex, ...patch } : ex));
}

export default function SessionTrackerPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, exercises, updateExercises } = useAutosaveTrackedSession(user?.uid, sessionId);

  const [machines, setMachines] = useState<Machine[]>([]);
  const [statsByExerciseId, setStatsByExerciseId] = useState<Record<string, MachineStats | null>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"resolve" | "add" | null>(null);
  const [pickerExerciseId, setPickerExerciseId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.gymId) {
      setMachines([]);
      return;
    }
    return onSnapshot(collection(db, "gyms", session.gymId, "machines"), (snap) =>
      setMachines(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Machine))
    );
  }, [session?.gymId]);

  // Auto-resolve an accepted suggestion's exercises (machineId: null, name +
  // machineCategory only) to a real gym machine by exact name match, same
  // convention the old SessionLogList used - but persisted here, since
  // TrackedSession (not derived render state) is now the source of truth.
  useEffect(() => {
    const unresolved = exercises.filter((ex) => !ex.machineId);
    if (unresolved.length === 0 || machines.length === 0) return;
    let next = exercises;
    let changed = false;
    for (const ex of unresolved) {
      const match = machines.find((m) => m.name.trim().toLowerCase() === ex.name.trim().toLowerCase());
      if (match) {
        next = patchExercise(next, ex.id, { machineId: match.id, gymId: session?.gymId ?? null });
        changed = true;
      }
    }
    if (changed) updateExercises(() => next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines, exercises]);

  useEffect(() => {
    const toFetch = exercises.filter((ex) => ex.machineId && !(ex.id in statsByExerciseId));
    if (!user || toFetch.length === 0) return;
    void Promise.all(
      toFetch.map(async (ex) => {
        try {
          const snap = await getDoc(doc(db, "users", user.uid, "machineStats", ex.machineId!));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, user]);

  if (session === undefined) return <div className="card">Loading session...</div>;
  if (session === null) {
    return (
      <div className="card">
        <p>This session doesn't exist (anymore).</p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>
          Back to Home
        </button>
      </div>
    );
  }

  // Computed against local `exercises` state, not `session.status` from
  // Firestore - the latter lags the user's last tap by the autosave debounce
  // plus a round-trip echo, which would make PlateRing's completion flash
  // feel broken instead of satisfying. See computeTrackedSessionStatus.
  const isDoneLocally = computeTrackedSessionStatus(exercises) === "done";

  function toggleSkip(ex: TrackedExercise) {
    updateExercises((prev) =>
      patchExercise(prev, ex.id, {
        status: ex.status === "skipped" ? (ex.sets.length > 0 ? "logged" : "pending") : "skipped",
      })
    );
  }

  function applySameAsLast(ex: TrackedExercise) {
    const stats = statsByExerciseId[ex.id];
    if (!stats?.lastSets?.length) return;
    updateExercises((prev) =>
      patchExercise(prev, ex.id, { sets: stats.lastSets.map((s) => ({ ...s })), status: "logged" })
    );
  }

  function handleSetsChange(exerciseId: string, sets: TrackedExercise["sets"]) {
    updateExercises((prev) =>
      patchExercise(prev, exerciseId, { sets, status: sets.length > 0 ? "logged" : "pending" })
    );
  }

  function handleMachineResolved(machine: Machine) {
    if (pickerMode === "resolve" && pickerExerciseId) {
      updateExercises((prev) =>
        patchExercise(prev, pickerExerciseId, { machineId: machine.id, gymId: session!.gymId })
      );
    } else if (pickerMode === "add") {
      const newExercise: TrackedExercise = {
        id: crypto.randomUUID(),
        name: machine.name,
        machineId: machine.id,
        gymId: session!.gymId,
        machineCategory: machine.category,
        sets: [],
        status: "pending",
      };
      updateExercises((prev) => [...prev, newExercise]);
    }
    setPickerMode(null);
    setPickerExerciseId(null);
  }

  return (
    <div className="tracker-page">
      <div className="tracker-header">
        <div>
          <p className="tracker-date">
            {weekdayLabel(session.date)} · {shortDateLabel(session.date)}
          </p>
          <div className="tracker-focus-row">
            <FocusIcon focus={session.focus} width={20} height={20} />
            <h1 className="tracker-focus">{FOCUS_LABELS[session.focus] ?? session.focus}</h1>
          </div>
        </div>
        <div className="tracker-status">
          <PlateRing
            size={40}
            fillPercent={
              exercises.length > 0 ? exercises.filter((ex) => ex.status !== "pending").length / exercises.length : 0
            }
            color={isDoneLocally ? "var(--success)" : "var(--accent)"}
            label={isDoneLocally ? "✓" : undefined}
            celebrate={isDoneLocally}
          />
          <span className="tracker-status-label">{isDoneLocally ? "Done" : "In progress"}</span>
        </div>
      </div>

      {exercises.length === 0 ? (
        <div className="card tracker-empty">
          <p>No exercises yet.</p>
        </div>
      ) : (
        <div className="tracker-carousel">
          {exercises.map((ex) => {
            const catalogMatch = findCatalogMachine(ex.name);
            const isExpanded = expandedId === ex.id;
            return (
              <button
                key={ex.id}
                type="button"
                className={
                  "tracker-card" +
                  (ex.status === "logged" ? " tracker-card-logged" : "") +
                  (ex.status === "skipped" ? " tracker-card-skipped" : "") +
                  (isExpanded ? " tracker-card-active" : "")
                }
                onClick={() => {
                  if (!ex.machineId) {
                    setPickerMode("resolve");
                    setPickerExerciseId(ex.id);
                    return;
                  }
                  setExpandedId(isExpanded ? null : ex.id);
                }}
              >
                <MachineIcon iconId={catalogMatch?.id ?? ""} image={catalogMatch?.image} width={44} height={44} />
                <span className="tracker-card-name">{ex.name}</span>
                <span className="tracker-card-target tnum">
                  {ex.status === "logged"
                    ? summarizeSets(ex.sets)
                    : ex.status === "skipped"
                      ? "Skipped"
                      : ex.targetSets
                        ? `${ex.targetSets} × ${ex.targetReps}`
                        : "Tap to log"}
                </span>
                {!ex.machineId && <span className="tracker-card-nomatch">Find machine</span>}
              </button>
            );
          })}

          <button
            type="button"
            className="tracker-card tracker-card-add"
            onClick={() => setPickerMode("add")}
          >
            <span className="tracker-card-add-icon">+</span>
            <span className="tracker-card-name">Add exercise</span>
          </button>
        </div>
      )}

      <Sheet open={Boolean(expandedId)} onClose={() => setExpandedId(null)}>
        {(() => {
          const ex = exercises.find((e) => e.id === expandedId);
          if (!ex) return null;
          return (
            <div className="tracker-editor-wrap">
              {statsByExerciseId[ex.id]?.lastSets?.length ? (
                <button
                  type="button"
                  className="btn btn-secondary tracker-same-as-last"
                  onClick={() => applySameAsLast(ex)}
                >
                  Same as last time ({summarizeSets(statsByExerciseId[ex.id]!.lastSets)})
                </button>
              ) : null}
              <SetEditor
                title={ex.name}
                sets={ex.sets}
                onSetsChange={(sets) => handleSetsChange(ex.id, sets)}
                onClose={() => setExpandedId(null)}
              />
              <button type="button" className="tracker-skip-btn" onClick={() => toggleSkip(ex)}>
                {ex.status === "skipped" ? "Undo skip" : "Skip this exercise"}
              </button>
            </div>
          );
        })()}
      </Sheet>

      <Sheet
        open={Boolean(pickerMode && session.gymId)}
        onClose={() => {
          setPickerMode(null);
          setPickerExerciseId(null);
        }}
      >
        {pickerMode && session.gymId && (
          <MachinePicker
            gymId={session.gymId}
            uid={user!.uid}
            machines={machines}
            title={pickerMode === "add" ? "Add an exercise" : "Find a machine for this exercise"}
            onSelect={handleMachineResolved}
            onClose={() => {
              setPickerMode(null);
              setPickerExerciseId(null);
            }}
          />
        )}
      </Sheet>

      <style>{`
        .tracker-page {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .tracker-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-3);
        }
        .tracker-date {
          margin: 0 0 var(--space-1);
          font-size: 13px;
          color: var(--text-muted);
        }
        .tracker-focus-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .tracker-focus {
          font-size: 24px;
          font-weight: 700;
        }
        .tracker-status {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-1);
        }
        .tracker-status-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .tracker-empty {
          color: var(--text-muted);
        }
        .tracker-carousel {
          display: flex;
          gap: var(--space-3);
          overflow-x: auto;
          scroll-snap-type: x proximity;
          padding-bottom: var(--space-2);
          margin: 0 calc(var(--space-4) * -1);
          padding-left: var(--space-4);
          padding-right: var(--space-4);
        }
        .tracker-card {
          scroll-snap-align: start;
          flex: 0 0 132px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-2);
          text-align: center;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
          padding: var(--space-4) var(--space-3);
          color: var(--text);
          cursor: pointer;
        }
        .tracker-card-active {
          border-color: var(--accent);
          box-shadow: var(--shadow-md);
        }
        .tracker-card-logged {
          border-color: var(--success);
        }
        .tracker-card-skipped {
          opacity: 0.5;
        }
        .tracker-card-name {
          font-size: 13px;
          font-weight: 600;
          line-height: 1.2;
        }
        .tracker-card-target {
          font-size: 12px;
          color: var(--text-muted);
        }
        .tracker-card-nomatch {
          font-size: 11px;
          color: var(--accent);
        }
        .tracker-card-add {
          justify-content: center;
          border-style: dashed;
          color: var(--text-muted);
          box-shadow: none;
        }
        .tracker-card-add-icon {
          font-size: 28px;
          line-height: 1;
        }
        .tracker-editor-wrap {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .tracker-same-as-last {
          align-self: flex-start;
          font-size: 13px;
        }
        .tracker-skip-btn {
          align-self: center;
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 13px;
          cursor: pointer;
          padding: 0;
        }
        /* Shared classes for the borrowed-style children SetEditor and
           MachinePicker (neither ships its own <style> - see their file
           comments). This page is now their only mount point. */
        .log-status-muted {
          color: var(--text-muted);
          font-size: 14px;
        }
        .log-error-text {
          color: var(--danger);
          font-size: 13px;
        }
        .log-search-input {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text);
          padding: var(--space-2) var(--space-3);
          width: 100%;
        }
        .log-machine-group {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .log-machine-group-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .log-machine-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .log-machine-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          color: var(--text);
          font-size: 15px;
          text-align: left;
          cursor: pointer;
        }
        .machine-picker {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          width: 100%;
        }
        .machine-picker-row-main {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .machine-picker-create {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          padding-top: var(--space-2);
          border-top: 1px solid var(--border);
        }
        .machine-picker-create-row {
          display: flex;
          gap: var(--space-2);
        }
        .machine-picker-select {
          flex: 1;
        }
        .log-set-panel {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .log-set-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .log-set-panel-title {
          font-size: 18px;
          font-weight: 600;
        }
        .log-panel-close {
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
          padding: 0;
        }
        .log-same-as-last-btn {
          align-self: flex-start;
          font-size: 13px;
        }
        .log-set-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .log-set-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          flex-wrap: wrap;
        }
        .log-set-index {
          font-size: 13px;
          color: var(--text-muted);
          min-width: 44px;
        }
        .log-stepper {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: var(--space-1) var(--space-2);
        }
        .log-stepper button {
          width: 26px;
          height: 26px;
          border-radius: var(--radius-sm);
          border: none;
          background: var(--surface);
          color: var(--text);
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        }
        .log-stepper-value {
          min-width: 64px;
          text-align: center;
          font-size: 14px;
          font-weight: 600;
        }
        .log-set-remove {
          background: none;
          border: none;
          color: var(--danger);
          font-size: 13px;
          cursor: pointer;
          padding: 0;
        }
        .log-add-set-btn {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
