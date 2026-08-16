// Sibling to PlanDayExercises (which stays the no-status planning-time
// renderer) — adds a per-exercise completion indicator and shows logged
// sets instead of just targets once a session is done/partial.
import type { PlanExercise } from "../../lib/types";
import { findCatalogMachine } from "../../lib/machineCatalog";
import MachineIcon from "../../components/MachineIcon";
import MuscleDiagram from "../../components/MuscleDiagram";
import type { ExerciseCompletion } from "./sessionCompletion";

interface SessionExerciseRowProps {
  exercise: PlanExercise;
  completion?: ExerciseCompletion;
}

function summarizeSets(sets: { reps: number; weightKg: number }[]): string {
  return sets.map((s) => `${s.reps}×${s.weightKg}kg`).join(", ");
}

export default function SessionExerciseRow({ exercise, completion }: SessionExerciseRowProps) {
  const catalogMatch = findCatalogMachine(exercise.name);
  const done = completion?.done ?? false;

  return (
    <li className={"session-exercise-row" + (done ? " session-exercise-row-done" : "")}>
      <span className={"session-exercise-check" + (done ? " session-exercise-check-done" : "")} aria-hidden>
        {done ? "✓" : ""}
      </span>
      <MachineIcon iconId={catalogMatch?.id ?? ""} image={catalogMatch?.image} width={24} height={24} />
      <div className="session-exercise-info">
        <span className="session-exercise-name">{exercise.name}</span>
        {done && completion?.loggedSets ? (
          <span className="session-exercise-sets tnum">Logged: {summarizeSets(completion.loggedSets)}</span>
        ) : done ? (
          <span className="session-exercise-sets">Logged</span>
        ) : (
          <span className="session-exercise-sets">
            {exercise.sets} × {exercise.reps}
          </span>
        )}
        {exercise.note && <span className="session-exercise-note">{exercise.note}</span>}
      </div>
      <MuscleDiagram targetMuscles={exercise.targetMuscles} />

      <style>{`
        .session-exercise-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-3);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
        }
        .session-exercise-row-done {
          border-color: var(--success);
        }
        .session-exercise-check {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          border-radius: 50%;
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          color: transparent;
        }
        .session-exercise-check-done {
          background: var(--success);
          border-color: var(--success);
          color: var(--bg);
        }
        .session-exercise-info {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }
        .session-exercise-name {
          font-size: 14px;
          font-weight: 600;
        }
        .session-exercise-sets {
          font-size: 12px;
          color: var(--text-muted);
        }
        .session-exercise-note {
          font-size: 12px;
          color: var(--text-muted);
        }
      `}</style>
    </li>
  );
}
