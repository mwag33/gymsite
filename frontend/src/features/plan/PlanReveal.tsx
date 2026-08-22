import { useState } from "react";
import type { Session } from "../../lib/types";
import { weekdayLabel } from "./planDate";
import { FOCUS_LABELS } from "./planFocus";
import PlanDayExercises from "./PlanDayExercises";
import PlanEditor from "./PlanEditor";

interface PlanRevealProps {
  // Onboarding's first-week slice only — never the full 28-day schedule (see
  // OnboardingFlow.tsx's schedule-review/exercise-review phases). Nothing
  // outside onboarding uses this component; Home reads sessions directly via
  // TodayHero/MonthAgenda instead.
  sessions: Session[];
  onAccept?: () => void;
  onAdjust?: () => void;
  // Lets the parent (onboarding, which owns the local plan state) reflect an
  // edit immediately rather than waiting on its own subscription.
  onSessionsChange?: (sessions: Session[]) => void;
}

export default function PlanReveal({ sessions, onAccept, onAdjust, onSessionsChange }: PlanRevealProps) {
  const [editing, setEditing] = useState(false);
  const sortedSessions = [...sessions].sort((a, b) => a.date.localeCompare(b.date));

  function handleAdjust() {
    setEditing(true);
    onAdjust?.();
  }

  function handleSaved(updated: Session[]) {
    setEditing(false);
    onSessionsChange?.(updated);
  }

  if (editing) {
    return (
      <PlanEditor sessions={sessions} onSaved={handleSaved} onCancel={() => setEditing(false)} />
    );
  }

  return (
    <div className="plan-reveal">
      <div className="plan-reveal-days">
        {sortedSessions.map((session) => {
          const isTraining = session.focus !== "rest";
          return (
            <div
              key={session.id}
              className={"card plan-reveal-day" + (isTraining ? " plan-reveal-day-active" : "")}
            >
              <div className="plan-reveal-day-header">
                <span className="plan-reveal-day-name">{weekdayLabel(session.date)}</span>
                <span className={"plan-reveal-focus" + (isTraining ? " plan-reveal-focus-active" : "")}>
                  {FOCUS_LABELS[session.focus]}
                </span>
              </div>
              {session.note && <p className="plan-reveal-note">{session.note}</p>}
              <PlanDayExercises exercises={session.exercises ?? undefined} />
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
