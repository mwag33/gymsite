import { useState } from "react";
import type { TrainingPlan, TrainingPlanDay } from "../../lib/types";
import { dayLabel as computeDayLabel } from "./planDate";
import { FOCUS_LABELS } from "./planFocus";
import PlanDayExercises from "./PlanDayExercises";
import PlanEditor from "./PlanEditor";

interface PlanRevealProps {
  plan: TrainingPlan;
  mode: "initial" | "recalculated";
  onAccept?: () => void;
  onAdjust?: () => void;
  // Lets the parent (which owns the actual plan state - local in onboarding,
  // a Firestore snapshot on the home page) reflect an edit immediately rather
  // than waiting on its own update path.
  onPlanChange?: (days: TrainingPlanDay[]) => void;
}

export default function PlanReveal({ plan, mode, onAccept, onAdjust, onPlanChange }: PlanRevealProps) {
  const [editing, setEditing] = useState(false);
  const sortedDays = [...plan.days].sort((a, b) => a.dayIndex - b.dayIndex);

  function handleAdjust() {
    setEditing(true);
    onAdjust?.();
  }

  function handleSaved(updatedDays: TrainingPlanDay[]) {
    setEditing(false);
    onPlanChange?.(updatedDays);
  }

  if (editing) {
    return <PlanEditor plan={plan} onSaved={handleSaved} onCancel={() => setEditing(false)} />;
  }

  return (
    <div className="plan-reveal">
      {mode === "recalculated" && plan.basedOnLogId != null && (
        <div className="plan-reveal-updated">
          <span className="plan-reveal-updated-dot" aria-hidden />
          Plan updated
        </div>
      )}

      <div className="plan-reveal-days">
        {sortedDays.map((day) => {
          const isTraining = day.focus !== "rest";
          return (
            <div
              key={day.dayIndex}
              className={"card plan-reveal-day" + (isTraining ? " plan-reveal-day-active" : "")}
            >
              <div className="plan-reveal-day-header">
                <span className="plan-reveal-day-name">{computeDayLabel(plan.weekStart, day.dayIndex)}</span>
                <span className={"plan-reveal-focus" + (isTraining ? " plan-reveal-focus-active" : "")}>
                  {FOCUS_LABELS[day.focus]}
                </span>
              </div>
              {day.note && <p className="plan-reveal-note">{day.note}</p>}
              <PlanDayExercises exercises={day.exercises} />
            </div>
          );
        })}
      </div>

      <div className="plan-reveal-actions">
        {mode === "initial" && (
          <button type="button" className="btn btn-primary plan-reveal-btn" onClick={onAccept}>
            Looks good, start this week
          </button>
        )}
        <button type="button" className="btn btn-secondary plan-reveal-btn" onClick={handleAdjust}>
          {mode === "initial" ? "Adjust plan" : "Edit plan"}
        </button>
      </div>

      <style>{`
        .plan-reveal {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .plan-reveal-updated {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          align-self: flex-start;
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-2) var(--space-3);
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
        }
        .plan-reveal-updated-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--success);
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
