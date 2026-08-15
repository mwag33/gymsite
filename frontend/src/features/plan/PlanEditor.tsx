import { useState } from "react";
import { updateTrainingPlan } from "../../lib/callables";
import type { MachineCategory, MuscleGroup, PlanExercise, TrainingPlan, TrainingPlanDay } from "../../lib/types";
import { dayLabel } from "./planDate";
import { FOCUS_LABELS } from "./planFocus";
import { findCatalogMachine } from "../../lib/machineCatalog";
import MachineIcon from "../../components/MachineIcon";

const MUSCLE_GROUP_OPTIONS: { value: MuscleGroup; label: string }[] = [
  { value: "chest", label: "Chest" },
  { value: "upper_back", label: "Upper back" },
  { value: "lats", label: "Lats" },
  { value: "shoulders", label: "Shoulders" },
  { value: "biceps", label: "Biceps" },
  { value: "triceps", label: "Triceps" },
  { value: "forearms", label: "Forearms" },
  { value: "abs", label: "Abs" },
  { value: "obliques", label: "Obliques" },
  { value: "glutes", label: "Glutes" },
  { value: "quads", label: "Quads" },
  { value: "hamstrings", label: "Hamstrings" },
  { value: "calves", label: "Calves" },
  { value: "cardio", label: "Cardio" },
];

interface NewExerciseDraft {
  name: string;
  sets: number;
  reps: string;
  muscles: MuscleGroup[];
}

function emptyDraft(): NewExerciseDraft {
  return { name: "", sets: 3, reps: "8-12", muscles: [] };
}

function cloneDays(plan: TrainingPlan): TrainingPlanDay[] {
  return plan.days.map((d) => ({ ...d, exercises: (d.exercises ?? []).map((ex) => ({ ...ex })) }));
}

interface PlanEditorProps {
  plan: TrainingPlan;
  onSaved: (days: TrainingPlanDay[]) => void;
  onCancel: () => void;
}

export default function PlanEditor({ plan, onSaved, onCancel }: PlanEditorProps) {
  const [days, setDays] = useState<TrainingPlanDay[]>(() => cloneDays(plan));
  const [drafts, setDrafts] = useState<Record<number, NewExerciseDraft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedDays = [...days].sort((a, b) => a.dayIndex - b.dayIndex);

  function updateExercise(dayIndex: number, exerciseId: string, patch: Partial<PlanExercise>) {
    setDays((prev) =>
      prev.map((d) =>
        d.dayIndex !== dayIndex
          ? d
          : {
              ...d,
              exercises: (d.exercises ?? []).map((ex) =>
                ex.id === exerciseId ? { ...ex, ...patch } : ex
              ),
            }
      )
    );
  }

  function removeExercise(dayIndex: number, exerciseId: string) {
    setDays((prev) =>
      prev.map((d) =>
        d.dayIndex !== dayIndex
          ? d
          : { ...d, exercises: (d.exercises ?? []).filter((ex) => ex.id !== exerciseId) }
      )
    );
  }

  function draftFor(dayIndex: number): NewExerciseDraft {
    return drafts[dayIndex] ?? emptyDraft();
  }

  function updateDraft(dayIndex: number, patch: Partial<NewExerciseDraft>) {
    setDrafts((prev) => ({ ...prev, [dayIndex]: { ...draftFor(dayIndex), ...patch } }));
  }

  function toggleDraftMuscle(dayIndex: number, muscle: MuscleGroup) {
    const draft = draftFor(dayIndex);
    const muscles = draft.muscles.includes(muscle)
      ? draft.muscles.filter((m) => m !== muscle)
      : [...draft.muscles, muscle];
    updateDraft(dayIndex, { muscles });
  }

  function addExercise(day: TrainingPlanDay) {
    const draft = draftFor(day.dayIndex);
    const name = draft.name.trim();
    if (!name) return;
    const machineCategory: MachineCategory = day.focus === "rest" ? "other" : day.focus;
    const exercises = day.exercises ?? [];
    const newExercise: PlanExercise = {
      id: `${day.dayIndex}-${Date.now()}-${exercises.length}`,
      name,
      sets: draft.sets,
      reps: draft.reps.trim() || "8-12",
      targetMuscles: draft.muscles,
      machineCategory,
    };
    setDays((prev) =>
      prev.map((d) =>
        d.dayIndex !== day.dayIndex ? d : { ...d, exercises: [...exercises, newExercise] }
      )
    );
    setDrafts((prev) => ({ ...prev, [day.dayIndex]: emptyDraft() }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateTrainingPlan(days);
      onSaved(days);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="plan-editor">
      {sortedDays.map((day) => {
        const draft = draftFor(day.dayIndex);
        return (
          <div key={day.dayIndex} className="card plan-editor-day">
            <div className="plan-editor-day-header">
              <span className="plan-editor-day-name">{dayLabel(plan.weekStart, day.dayIndex)}</span>
              <span className="plan-editor-day-focus">{FOCUS_LABELS[day.focus]}</span>
            </div>

            {(day.exercises ?? []).map((ex) => (
              <div key={ex.id} className="plan-editor-exercise-row">
                <MachineIcon iconId={findCatalogMachine(ex.name)?.id ?? ""} width={20} height={20} />
                <input
                  type="text"
                  className="plan-editor-input plan-editor-input-name"
                  value={ex.name}
                  onChange={(e) => updateExercise(day.dayIndex, ex.id, { name: e.target.value })}
                  aria-label="Exercise name"
                />
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="plan-editor-input plan-editor-input-sets"
                  value={ex.sets}
                  onChange={(e) =>
                    updateExercise(day.dayIndex, ex.id, { sets: Number(e.target.value) || 1 })
                  }
                  aria-label="Sets"
                />
                <input
                  type="text"
                  className="plan-editor-input plan-editor-input-reps"
                  value={ex.reps}
                  onChange={(e) => updateExercise(day.dayIndex, ex.id, { reps: e.target.value })}
                  aria-label="Reps"
                />
                <button
                  type="button"
                  className="plan-editor-remove-btn"
                  onClick={() => removeExercise(day.dayIndex, ex.id)}
                  aria-label={`Remove ${ex.name}`}
                >
                  ×
                </button>
              </div>
            ))}

            {day.focus !== "rest" && (
              <div className="plan-editor-add-row">
                <input
                  type="text"
                  placeholder="Add exercise"
                  className="plan-editor-input plan-editor-input-name"
                  value={draft.name}
                  onChange={(e) => updateDraft(day.dayIndex, { name: e.target.value })}
                />
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="plan-editor-input plan-editor-input-sets"
                  value={draft.sets}
                  onChange={(e) => updateDraft(day.dayIndex, { sets: Number(e.target.value) || 1 })}
                />
                <input
                  type="text"
                  className="plan-editor-input plan-editor-input-reps"
                  value={draft.reps}
                  onChange={(e) => updateDraft(day.dayIndex, { reps: e.target.value })}
                />
                <div className="plan-editor-muscle-chips">
                  {MUSCLE_GROUP_OPTIONS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      className={
                        "plan-editor-muscle-chip" +
                        (draft.muscles.includes(m.value) ? " plan-editor-muscle-chip-selected" : "")
                      }
                      onClick={() => toggleDraftMuscle(day.dayIndex, m.value)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!draft.name.trim()}
                  onClick={() => addExercise(day)}
                >
                  + Add
                </button>
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="plan-editor-error">{error}</p>}

      <div className="plan-editor-actions">
        <button type="button" className="btn btn-secondary plan-editor-btn" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary plan-editor-btn" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <style>{`
        .plan-editor {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .plan-editor-day {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .plan-editor-day-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .plan-editor-day-name {
          font-weight: 600;
          font-size: 14px;
        }
        .plan-editor-day-focus {
          font-size: 12px;
          color: var(--text-muted);
        }
        .plan-editor-exercise-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .plan-editor-input {
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm, 6px);
          padding: var(--space-2);
          color: var(--text);
          font-size: 13px;
        }
        .plan-editor-input-name {
          flex: 1;
          min-width: 0;
        }
        .plan-editor-input-sets {
          width: 48px;
        }
        .plan-editor-input-reps {
          width: 64px;
        }
        .plan-editor-remove-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
          padding: 0 var(--space-1);
        }
        .plan-editor-add-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--space-2);
          padding-top: var(--space-1);
          border-top: 1px dashed var(--border);
        }
        .plan-editor-muscle-chips {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-1);
          width: 100%;
        }
        .plan-editor-muscle-chip {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface-raised);
          color: var(--text-muted);
          cursor: pointer;
        }
        .plan-editor-muscle-chip-selected {
          border-color: var(--accent);
          color: var(--accent);
        }
        .plan-editor-error {
          color: var(--danger);
          font-size: 13px;
        }
        .plan-editor-actions {
          display: flex;
          gap: var(--space-3);
          position: sticky;
          bottom: 0;
          padding-top: var(--space-2);
        }
        .plan-editor-btn {
          flex: 1;
        }
      `}</style>
    </div>
  );
}
