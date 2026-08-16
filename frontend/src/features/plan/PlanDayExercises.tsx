// Read-only exercise list for a single training day - used by PlanReveal
// (both onboarding's exercise-review step and the home-page plan display).
import type { PlanExercise } from "../../lib/types";
import { findCatalogMachine } from "../../lib/machineCatalog";
import MachineIcon from "../../components/MachineIcon";
import MuscleDiagram from "../../components/MuscleDiagram";

interface PlanDayExercisesProps {
  // Optional - plan docs written before exercises existed have no field here.
  exercises: PlanExercise[] | undefined;
}

export default function PlanDayExercises({ exercises }: PlanDayExercisesProps) {
  const list = exercises ?? [];
  if (list.length === 0) return null;

  return (
    <div className="plan-day-exercises-wrap">
      <ul className="plan-day-exercises">
        {list.map((ex) => {
          const catalogMatch = findCatalogMachine(ex.name);
          return (
            <li key={ex.id} className="plan-day-exercise-row">
              <MachineIcon iconId={catalogMatch?.id ?? ""} image={catalogMatch?.image} width={24} height={24} />
              <div className="plan-day-exercise-info">
                <span className="plan-day-exercise-name">{ex.name}</span>
                <span className="plan-day-exercise-sets">
                  {ex.sets} × {ex.reps}
                </span>
                {ex.note && <span className="plan-day-exercise-note">{ex.note}</span>}
              </div>
              <MuscleDiagram targetMuscles={ex.targetMuscles} />
            </li>
          );
        })}
      </ul>

      <style>{`
        .plan-day-exercises {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .plan-day-exercise-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-3);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
        }
        .plan-day-exercise-info {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }
        .plan-day-exercise-name {
          font-size: 14px;
          font-weight: 600;
        }
        .plan-day-exercise-sets {
          font-size: 12px;
          color: var(--text-muted);
        }
        .plan-day-exercise-note {
          font-size: 12px;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
