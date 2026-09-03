import { useState } from "react";
import type { DraftDay } from "../../lib/types";
import { weekdayLabel } from "./planDate";
import { FOCUS_LABELS } from "./planFocus";
import PlanDayExercises from "./PlanDayExercises";
import PlanEditor from "./PlanEditor";

interface PlanRevealProps {
  // Onboarding's draft week only (see OnboardingFlow.tsx's schedule-review/
  // exercise-review phases). Nothing outside onboarding uses this component.
  days: DraftDay[];
  onAccept?: () => void;
  onAdjust?: () => void;
  // Lets the parent (onboarding, which owns the local draft state) reflect
  // an edit immediately rather than waiting on its own subscription.
  onDaysChange?: (days: DraftDay[]) => void;
}

export default function PlanReveal({ days, onAccept, onAdjust, onDaysChange }: PlanRevealProps) {
  const [editing, setEditing] = useState(false);
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));

  function handleAdjust() {
    setEditing(true);
    onAdjust?.();
  }

  function handleSaved(updated: DraftDay[]) {
    setEditing(false);
    onDaysChange?.(updated);
  }

  if (editing) {
    return <PlanEditor days={days} onSaved={handleSaved} onCancel={() => setEditing(false)} />;
  }

  return (
    <div className="plan-reveal">
      <div className="plan-reveal-days">
        {sortedDays.map((day) => {
          const isTraining = day.focus !== "rest";
          return (
            <div key={day.id} className={"card plan-reveal-day" + (isTraining ? " plan-reveal-day-active" : "")}>
              <div className="plan-reveal-day-header">
                <span className="plan-reveal-day-name">{weekdayLabel(day.date)}</span>
                <span className={"plan-reveal-focus" + (isTraining ? " plan-reveal-focus-active" : "")}>
                  {FOCUS_LABELS[day.focus]}
                </span>
              </div>
              {day.note && <p className="plan-reveal-note">{day.note}</p>}
              <PlanDayExercises exercises={day.exercises ?? undefined} />
            </div>
          );
        })}
      </div>

      <div className="plan-reveal-actions">
        {onAccept && (
          <button type="button" className="btn btn-primary plan-reveal-btn" onClick={onAccept}>
            Looks good, start this week
          </button>
        )}
        <button type="button" className="btn btn-secondary plan-reveal-btn" onClick={handleAdjust}>
          Adjust plan
        </button>
      </div>

      <style>{`
        .plan-reveal {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .plan-reveal-days {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .plan-reveal-day {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          border-left: 3px solid var(--border);
        }
        .plan-reveal-day-active {
          border-left-color: var(--accent);
        }
        .plan-reveal-day-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
        }
        .plan-reveal-day-name {
          font-weight: 600;
          font-size: 15px;
        }
        .plan-reveal-focus {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
        }
        .plan-reveal-focus-active {
          color: var(--accent);
        }
        .plan-reveal-note {
          margin: 0;
          font-size: 13px;
          color: var(--text-muted);
        }
        .plan-reveal-actions {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          position: sticky;
          bottom: 0;
          padding-top: var(--space-2);
        }
        .plan-reveal-btn {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
