// Shared stepper/set-editor. Controlled: the caller owns the draft `sets`
// array and receives updates via `onSetsChange`. Always mounted inside
// Sheet.tsx (SessionTrackerPage's only consumer), so the stepper buttons'
// `m.button` below picks up the LazyMotion/domAnimation features from
// Sheet's provider in the React tree - no LazyMotion wrapper needed here.
import { m } from "motion/react";
import type { MachineStats, SetEntry } from "../../lib/types";
import { tapScale, usePrefersReducedMotion } from "../../lib/motion";

const WEIGHT_STEP = 2.5;
const REPS_STEP = 1;

function roundWeight(n: number): number {
  return Math.round(n * 10) / 10;
}

export function summarizeSets(sets: SetEntry[]): string {
  return sets.map((s) => `${s.reps}×${s.weightKg}kg`).join(", ");
}

interface SetEditorProps {
  title: string;
  sets: SetEntry[];
  onSetsChange: (sets: SetEntry[]) => void;
  lastStats?: MachineStats | null;
  statsLoading?: boolean;
  onClose: () => void;
  error?: string | null;
}

export default function SetEditor({
  title,
  sets,
  onSetsChange,
  lastStats,
  statsLoading,
  onClose,
  error,
}: SetEditorProps) {
  const reducedMotion = usePrefersReducedMotion();
  const tapFeedback = reducedMotion ? undefined : tapScale;

  function adjustSet(index: number, field: "weightKg" | "reps", delta: number) {
    onSetsChange(
      sets.map((s, i) => {
        if (i !== index) return s;
        if (field === "weightKg") {
          return { ...s, weightKg: Math.max(0, roundWeight(s.weightKg + delta)) };
        }
        return { ...s, reps: Math.max(1, s.reps + delta) };
      })
    );
  }

  function addSet() {
    onSetsChange([...sets, sets.length > 0 ? { ...sets[sets.length - 1] } : { reps: 10, weightKg: 20 }]);
  }

  function removeSet(index: number) {
    onSetsChange(sets.filter((_, i) => i !== index));
  }

  function applySameAsLastTime() {
    if (!lastStats) return;
    onSetsChange(lastStats.lastSets.map((s) => ({ ...s })));
  }

  return (
    <div className="card log-set-panel">
      <div className="log-set-panel-header">
        <p className="log-set-panel-title">{title}</p>
        <button type="button" className="log-panel-close" onClick={onClose} aria-label="Close">
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
        {sets.map((set, i) => (
          <div key={i} className="log-set-row">
            <span className="log-set-index">Set {i + 1}</span>
            <div className="log-stepper">
              <m.button type="button" whileTap={tapFeedback} onClick={() => adjustSet(i, "weightKg", -WEIGHT_STEP)}>
                &minus;
              </m.button>
              <span className="tnum log-stepper-value">{set.weightKg} kg</span>
              <m.button type="button" whileTap={tapFeedback} onClick={() => adjustSet(i, "weightKg", WEIGHT_STEP)}>
                +
              </m.button>
            </div>
            <div className="log-stepper">
              <m.button type="button" whileTap={tapFeedback} onClick={() => adjustSet(i, "reps", -REPS_STEP)}>
                &minus;
              </m.button>
              <span className="tnum log-stepper-value">{set.reps} reps</span>
              <m.button type="button" whileTap={tapFeedback} onClick={() => adjustSet(i, "reps", REPS_STEP)}>
                +
              </m.button>
            </div>
            {sets.length > 1 && (
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
    </div>
  );
}
