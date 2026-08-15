import { useState } from "react";
import type { TrainingPlan, TrainingPlanFocus } from "../../lib/types";

const FOCUS_LABELS: Record<TrainingPlanFocus, string> = {
  chest: "Chest",
  back: "Back",
  legs: "Legs",
  core: "Core",
  cardio: "Cardio",
  upper_body: "Upper Body",
  other: "Other",
  rest: "Rest day",
};

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// The plan's `weekStart` Firestore Timestamp isn't strongly typed on the
// client (see TrainingPlan.weekStart: unknown), so duck-type it rather than
// import the admin/client Timestamp class here.
function toDate(value: unknown): Date | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

interface PlanRevealProps {
  plan: TrainingPlan;
  mode: "initial" | "recalculated";
  onAccept?: () => void;
  onAdjust?: () => void;
}

export default function PlanReveal({ plan, mode, onAccept, onAdjust }: PlanRevealProps) {
  const [showAdjustNote, setShowAdjustNote] = useState(false);
  const weekStart = toDate(plan.weekStart);
  const sortedDays = [...plan.days].sort((a, b) => a.dayIndex - b.dayIndex);

  function dayLabel(dayIndex: number): string {
    if (!weekStart) return `Day ${dayIndex + 1}`;
    const weekday = (weekStart.getDay() + dayIndex) % 7;
    return WEEKDAY_NAMES[weekday];
  }

  function handleAdjust() {
    setShowAdjustNote(true);
    onAdjust?.();
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
                <span className="plan-reveal-day-name">{dayLabel(day.dayIndex)}</span>
                <span className={"plan-reveal-focus" + (isTraining ? " plan-reveal-focus-active" : "")}>
                  {FOCUS_LABELS[day.focus]}
                </span>
              </div>
              {day.note && <p className="plan-reveal-note">{day.note}</p>}
            </div>
          );
        })}
      </div>

      {mode === "initial" && (
        <div className="plan-reveal-actions">
          {showAdjustNote && (
            <p className="plan-reveal-adjust-note">
              Manual plan editing is coming soon. For now, start this week as-is; it'll
              adjust automatically as you log workouts.
            </p>
          )}
          <button type="button" className="btn btn-primary plan-reveal-btn" onClick={onAccept}>
            Looks good, start this week
          </button>
          <button type="button" className="btn btn-secondary plan-reveal-btn" onClick={handleAdjust}>
            Adjust plan
          </button>
        </div>
      )}

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
        .plan-reveal-adjust-note {
          margin: 0;
          font-size: 13px;
          color: var(--text-muted);
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-3);
        }
        .plan-reveal-btn {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
