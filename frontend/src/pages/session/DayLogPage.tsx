// The single logging page for a calendar day, at /day/:date - merges the old
// DayDetailPage (accept/suggestion flow) and SessionTrackerPage (exercise
// carousel) into one screen with no accept step: a day is always editable,
// on any date, immediately. Exercises render as a horizontally-scrollable
// card carousel mixing already-logged/added cards with greyed "suggested"
// cards (history-ranked, filtered to the day's type) - tapping a suggestion
// adds and logs it in one step; every real card can be deleted with an
// undo toast.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { onSnapshot, collection } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveGym } from "../../contexts/ActiveGymContext";
import type { Machine, MachineCategory, TrackedExercise } from "../../lib/types";
import { MACHINE_CATEGORIES } from "../../lib/types";
import { findCatalogMachine } from "../../lib/machineCatalog";
import MachineIcon from "../../components/MachineIcon";
import MachinePicker from "../../components/MachinePicker";
import PlateRing from "../../components/PlateRing";
import Sheet from "../../components/Sheet";
import SetEditor, { summarizeSets } from "../log/SetEditor";
import { useDaySession } from "../../features/tracking/useDaySession";
import { useMachineStatsMap } from "../../features/tracking/useMachineStatsMap";
import { getRecommendedMachines } from "../../features/tracking/recommendedExercises";
import { defaultFocusForDate } from "../../features/tracking/dayActions";
import { weekdayLabel, shortDateLabel, toLocalDateKey } from "../../features/plan/planDate";
import { FocusTags, FOCUS_TAGS_STYLES } from "../../features/plan/FocusTags";
import { deriveSessionFocusTags } from "../../features/plan/deriveFocus";
import { EDITABLE_FOCUS_OPTIONS, FOCUS_LABELS } from "../../features/plan/planFocus";
import { FocusIcon } from "../../features/plan/focusIcons";

function patchExercise(
  exercises: TrackedExercise[],
  id: string,
  patch: Partial<TrackedExercise>
): TrackedExercise[] {
  return exercises.map((ex) => (ex.id === id ? { ...ex, ...patch } : ex));
}

export default function DayLogPage() {
  const { user, profile } = useAuth();
  const { activeGym } = useActiveGym();
  const { date } = useParams<{ date: string }>();

  const pattern = profile?.weeklyFocusPattern ?? null;
  const defaultFocus = date ? defaultFocusForDate(date, pattern) : "other";
  const { loading, focus, exercises, updateExercises, setFocus } = useDaySession(
    user?.uid,
    date,
    defaultFocus,
    activeGym?.id ?? null
  );

  const [machines, setMachines] = useState<Machine[]>([]);
  const statsByMachineId = useMachineStatsMap(user?.uid, activeGym?.id);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"resolve" | "add" | null>(null);
  const [pickerExerciseId, setPickerExerciseId] = useState<string | null>(null);
  const [changingFocus, setChangingFocus] = useState(false);
  const [undo, setUndo] = useState<{ exercise: TrackedExercise; index: number } | null>(null);

  useEffect(() => {
    if (!activeGym?.id) {
      setMachines([]);
      return;
    }
    return onSnapshot(collection(db, "gyms", activeGym.id, "machines"), (snap) =>
      setMachines(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Machine))
    );
  }, [activeGym?.id]);

  // Auto-resolve a materialized-from-onboarding exercise (machineId: null,
  // name + machineCategory only) to a real gym machine by exact name match.
  useEffect(() => {
    const unresolved = exercises.filter((ex) => !ex.machineId);
    if (unresolved.length === 0 || machines.length === 0) return;
    let next = exercises;
    let changed = false;
    for (const ex of unresolved) {
      const match = machines.find((m) => m.name.trim().toLowerCase() === ex.name.trim().toLowerCase());
      if (match) {
        next = patchExercise(next, ex.id, { machineId: match.id, gymId: activeGym?.id ?? null });
        changed = true;
      }
    }
    if (changed) updateExercises(() => next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines, exercises]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(t);
  }, [undo]);

  const excludeMachineIds = useMemo(
    () => new Set(exercises.filter((ex) => ex.machineId).map((ex) => ex.machineId as string)),
    [exercises]
  );
  const suggestions = useMemo(() => {
    if (!activeGym?.id) return [];
    const category: MachineCategory | null = focus === "rest" || focus === "other" ? null : focus;
    return getRecommendedMachines(statsByMachineId, machines, category, excludeMachineIds);
  }, [activeGym?.id, statsByMachineId, machines, focus, excludeMachineIds]);

  if (!date) return null;
  if (loading) return <div className="card">Loading...</div>;

  const focusTags = deriveSessionFocusTags({ exercises, focus });
  const today = toLocalDateKey(new Date());

  function toggleSkip(ex: TrackedExercise) {
    updateExercises((prev) =>
      patchExercise(prev, ex.id, {
        status: ex.status === "skipped" ? (ex.sets.length > 0 ? "logged" : "pending") : "skipped",
      })
    );
  }

  function applySameAsLast(ex: TrackedExercise) {
    const stats = ex.machineId ? statsByMachineId[ex.machineId] : undefined;
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
      updateExercises((prev) => patchExercise(prev, pickerExerciseId, { machineId: machine.id, gymId: activeGym?.id ?? null }));
    } else if (pickerMode === "add") {
      const newExercise: TrackedExercise = {
        id: crypto.randomUUID(),
        name: machine.name,
        machineId: machine.id,
        gymId: activeGym?.id ?? null,
        machineCategory: machine.category,
        targetMuscles: findCatalogMachine(machine.name)?.primaryMuscles,
        sets: [],
        status: "pending",
      };
      updateExercises((prev) => [...prev, newExercise]);
    }
    setPickerMode(null);
    setPickerExerciseId(null);
  }

  // Tapping a greyed suggestion adds it and opens its set editor immediately
  // - "greyed suggestion -> tap -> log" collapses into one action.
  function handleTapSuggestion(machine: Machine) {
    const newExercise: TrackedExercise = {
      id: crypto.randomUUID(),
      name: machine.name,
      machineId: machine.id,
      gymId: activeGym?.id ?? null,
      machineCategory: machine.category,
      targetMuscles: findCatalogMachine(machine.name)?.primaryMuscles,
      sets: [],
      status: "pending",
    };
    updateExercises((prev) => [...prev, newExercise]);
    setExpandedId(newExercise.id);
  }

  // No-active-gym fallback: a machine-less "logged" exercise carrying just a
  // category. Tapping an already-logged chip again removes it.
  function handleCategoryTap(category: TrackedExercise["machineCategory"]) {
    const newExercise: TrackedExercise = {
      id: crypto.randomUUID(),
      name: MACHINE_CATEGORIES.find((c) => c.value === category)?.label ?? category,
      machineId: null,
      gymId: null,
      machineCategory: category,
      sets: [],
      status: "logged",
    };
    updateExercises((prev) => [...prev, newExercise]);
  }

  function removeExercise(ex: TrackedExercise) {
    const index = exercises.findIndex((e) => e.id === ex.id);
    updateExercises((prev) => prev.filter((e) => e.id !== ex.id));
    setUndo({ exercise: ex, index });
    if (expandedId === ex.id) setExpandedId(null);
  }

  function handleUndo() {
    if (!undo) return;
    updateExercises((prev) => {
      const next = [...prev];
      next.splice(Math.min(undo.index, next.length), 0, undo.exercise);
      return next;
    });
    setUndo(null);
  }

  return (
    <div className="day-log-page">
      <div className="day-log-header">
        <div>
          <p className="day-log-date">
            {date === today ? "Today" : weekdayLabel(date)} · {shortDateLabel(date)}
          </p>
          <button type="button" className="day-log-focus-btn" onClick={() => setChangingFocus((v) => !v)}>
            <FocusTags categories={focusTags.categories} muscles={focusTags.muscles} iconSize={22} />
            <span className="day-log-focus-edit">{changingFocus ? "Cancel" : "Change type"}</span>
          </button>
        </div>
        <PlateRing
          size={40}
          fillPercent={exercises.length > 0 ? exercises.filter((ex) => ex.status !== "pending").length / exercises.length : 0}
          color={exercises.length > 0 && exercises.every((ex) => ex.status !== "pending") ? "var(--success)" : "var(--accent)"}
          label={exercises.length > 0 && exercises.every((ex) => ex.status !== "pending") ? "✓" : undefined}
        />
      </div>

      {changingFocus && (
        <div className="day-log-swap" role="list">
          {EDITABLE_FOCUS_OPTIONS.map((f) => (
            <button
              key={f}
              type="button"
              role="listitem"
              className={"day-log-swap-chip" + (f === focus ? " day-log-swap-chip-active" : "")}
              onClick={() => {
                void setFocus(f);
                setChangingFocus(false);
              }}
            >
              <FocusIcon focus={f} width={14} height={14} />
              {FOCUS_LABELS[f]}
            </button>
          ))}
        </div>
      )}

      {!activeGym?.id ? (
        <div className="card day-log-category-grid">
          {MACHINE_CATEGORIES.map((cat) => {
            const existing = exercises.find((ex) => ex.machineCategory === cat.value);
            return (
              <button
                key={cat.value}
                type="button"
                className={"day-log-category-card" + (existing ? " day-log-category-card-active" : "")}
                onClick={() => (existing ? removeExercise(existing) : handleCategoryTap(cat.value))}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="day-log-carousel">
          {exercises.map((ex) => {
            const catalogMatch = findCatalogMachine(ex.name);
            const isExpanded = expandedId === ex.id;
            return (
              <div
                key={ex.id}
                className={
                  "day-log-card" +
                  (ex.status === "logged" ? " day-log-card-logged" : "") +
                  (ex.status === "skipped" ? " day-log-card-skipped" : "") +
                  (isExpanded ? " day-log-card-active" : "")
                }
              >
                <button
                  type="button"
                  className="day-log-card-remove"
                  aria-label={`Remove ${ex.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeExercise(ex);
                  }}
                >
                  ×
                </button>
                <button
                  type="button"
                  className="day-log-card-body"
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
                  <span className="day-log-card-name">{ex.name}</span>
                  <span className="day-log-card-target tnum">
                    {ex.status === "logged"
                      ? summarizeSets(ex.sets)
                      : ex.status === "skipped"
                        ? "Skipped"
                        : ex.targetSets
                          ? `${ex.targetSets} × ${ex.targetReps}`
                          : "Tap to log"}
                  </span>
                  {!ex.machineId && <span className="day-log-card-nomatch">Find machine</span>}
                </button>
              </div>
            );
          })}

          {suggestions.map(({ machine }) => {
            const catalogMatch = findCatalogMachine(machine.name);
            return (
              <button
                key={machine.id}
                type="button"
                className="day-log-card day-log-card-suggested"
                onClick={() => handleTapSuggestion(machine)}
              >
                <MachineIcon iconId={catalogMatch?.id ?? ""} image={catalogMatch?.image} width={44} height={44} />
                <span className="day-log-card-name">{machine.name}</span>
                <span className="day-log-card-target">Suggested</span>
              </button>
            );
          })}

          <button type="button" className="day-log-card day-log-card-add" onClick={() => setPickerMode("add")}>
            <span className="day-log-card-add-icon">+</span>
            <span className="day-log-card-name">Add exercise</span>
          </button>
        </div>
      )}

      {undo && (
        <div className="day-log-toast">
          <span>Removed {undo.exercise.name}</span>
          <button type="button" onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}

      <Sheet open={Boolean(expandedId)} onClose={() => setExpandedId(null)}>
        {(() => {
          const ex = exercises.find((e) => e.id === expandedId);
          if (!ex) return null;
          const lastStats = ex.machineId ? statsByMachineId[ex.machineId] : undefined;
          return (
            <div className="day-log-editor-wrap">
              {lastStats?.lastSets?.length ? (
                <button type="button" className="btn btn-secondary day-log-same-as-last" onClick={() => applySameAsLast(ex)}>
                  Same as last time ({summarizeSets(lastStats.lastSets)})
                </button>
              ) : null}
              <SetEditor title={ex.name} sets={ex.sets} onSetsChange={(sets) => handleSetsChange(ex.id, sets)} onClose={() => setExpandedId(null)} />
              <button type="button" className="day-log-skip-btn" onClick={() => toggleSkip(ex)}>
                {ex.status === "skipped" ? "Undo skip" : "Skip this exercise"}
              </button>
            </div>
          );
        })()}
      </Sheet>

      <Sheet
        open={Boolean(pickerMode && activeGym?.id)}
        onClose={() => {
          setPickerMode(null);
          setPickerExerciseId(null);
        }}
      >
        {pickerMode && activeGym?.id && (
          <MachinePicker
            gymId={activeGym.id}
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
        ${FOCUS_TAGS_STYLES}
        .day-log-page {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .day-log-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-3);
        }
        .day-log-date {
          margin: 0 0 var(--space-1);
          font-size: 13px;
          color: var(--text-muted);
        }
        .day-log-focus-btn {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          background: none;
          border: none;
          padding: 0;
          color: var(--text);
          cursor: pointer;
        }
        .day-log-focus-btn .focus-tags-item {
          font-size: 22px;
          font-weight: 700;
        }
        .day-log-focus-edit {
          font-size: 12px;
          font-weight: 600;
          color: var(--accent);
        }
        .day-log-swap {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }
        .day-log-swap-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-2) var(--space-3);
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .day-log-swap-chip-active {
          border-color: var(--accent);
          background: var(--accent-surface);
          color: var(--accent);
        }
        .day-log-category-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-3);
        }
        .day-log-category-card {
          padding: var(--space-5) var(--space-3);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-size: 15px;
          font-weight: 600;
          text-align: center;
          cursor: pointer;
        }
        .day-log-category-card-active {
          border-color: var(--success);
          background: var(--surface-raised);
          color: var(--success);
        }
        .day-log-carousel {
          display: flex;
          gap: var(--space-3);
          overflow-x: auto;
          scroll-snap-type: x proximity;
          padding-bottom: var(--space-2);
          margin: 0 calc(var(--space-4) * -1);
          padding-left: var(--space-4);
          padding-right: var(--space-4);
        }
        .day-log-card {
          position: relative;
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
        .day-log-card-body {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-2);
          background: none;
          border: none;
          padding: 0;
          color: inherit;
          font: inherit;
          cursor: pointer;
          width: 100%;
        }
        .day-log-card-remove {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: none;
          background: var(--surface-raised);
          color: var(--text-muted);
          font-size: 15px;
          line-height: 1;
          cursor: pointer;
        }
        .day-log-card-active {
          border-color: var(--accent);
          box-shadow: var(--shadow-md);
        }
        .day-log-card-logged {
          border-color: var(--success);
        }
        .day-log-card-skipped {
          opacity: 0.5;
        }
        .day-log-card-suggested {
          opacity: 0.55;
          border-style: dashed;
        }
        .day-log-card-name {
          font-size: 13px;
          font-weight: 600;
          line-height: 1.2;
        }
        .day-log-card-target {
          font-size: 12px;
          color: var(--text-muted);
        }
        .day-log-card-nomatch {
          font-size: 11px;
          color: var(--accent);
        }
        .day-log-card-add {
          justify-content: center;
          border-style: dashed;
          color: var(--text-muted);
          box-shadow: none;
        }
        .day-log-card-add-icon {
          font-size: 28px;
          line-height: 1;
        }
        .day-log-toast {
          position: sticky;
          bottom: var(--space-3);
          align-self: center;
          display: flex;
          align-items: center;
          gap: var(--space-3);
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: var(--space-2) var(--space-4);
          font-size: 13px;
          box-shadow: var(--shadow-md);
        }
        .day-log-toast button {
          background: none;
          border: none;
          color: var(--accent);
          font-weight: 600;
          cursor: pointer;
          padding: 0;
        }
        .day-log-editor-wrap {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .day-log-same-as-last {
          align-self: flex-start;
          font-size: 13px;
        }
        .day-log-skip-btn {
          align-self: center;
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 13px;
          cursor: pointer;
          padding: 0;
        }
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
