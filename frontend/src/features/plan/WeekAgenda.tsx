// Primary calendar view on Home: the current week as 7 rows, one per day,
// with more detail per row than the month grid's tiny cells (focus label,
// not just an icon). Tapping a row opens DayEditSheet inline (see HomePage)
// - no navigation, no accept step, no redirect chain.
import type { DaySession, TrainingPlanFocus } from "../../lib/types";
import { addDaysToKey, dayOfMonth, weekdayLabel } from "./planDate";
import { FocusIcon } from "./focusIcons";
import { FOCUS_LABELS } from "./planFocus";
import { dayViewFor } from "./daySessionsRange";
import PlateRing from "../../components/PlateRing";

interface WeekAgendaProps {
  byDate: Record<string, DaySession>;
  pattern: TrainingPlanFocus[] | null;
  today: string;
  weekStart: string;
  onSelectDate: (date: string) => void;
}

function ringFor(status: ReturnType<typeof dayViewFor>["status"]): { fillPercent: number; color: string } {
  switch (status) {
    case "done":
      return { fillPercent: 1, color: "var(--success)" };
    case "in_progress":
      return { fillPercent: 0.5, color: "var(--accent)" };
    default:
      return { fillPercent: 0, color: "var(--border)" };
  }
}

export default function WeekAgenda({ byDate, pattern, today, weekStart, onSelectDate }: WeekAgendaProps) {
  const dates = Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i));

  return (
    <div className="week-agenda card">
      {dates.map((date) => {
        const isToday = date === today;
        const view = dayViewFor(date, byDate[date], pattern);
        const isRest = view.focus === "rest" && !view.displayCategory;
        const ring = isRest ? { fillPercent: 0, color: "var(--border)" } : ringFor(view.status);
        return (
          <button
            key={date}
            type="button"
            className={"week-agenda-row" + (isToday ? " week-agenda-row-today" : "")}
            onClick={() => onSelectDate(date)}
          >
            <span className="week-agenda-daynum tnum">{dayOfMonth(date)}</span>
            <PlateRing size={28} notches={0} fillPercent={ring.fillPercent} color={ring.color} holeColor="var(--surface-raised)" />
            <span className="week-agenda-weekday">{weekdayLabel(date)}</span>
            <span className="week-agenda-focus">
              {view.displayCategory ? (
                <>
                  <FocusIcon focus={view.displayCategory} width={14} height={14} />
                  {FOCUS_LABELS[view.displayCategory]}
                </>
              ) : (
                FOCUS_LABELS[view.focus]
              )}
            </span>
          </button>
        );
      })}

      <style>{`
        .week-agenda {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          padding: var(--space-2);
        }
        .week-agenda-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid transparent;
          background: transparent;
          color: var(--text);
          cursor: pointer;
          text-align: left;
        }
        .week-agenda-row-today {
          border-color: var(--accent);
          background: var(--accent-surface);
        }
        .week-agenda-daynum {
          width: 22px;
          font-size: 14px;
          font-weight: 700;
          color: var(--text-muted);
        }
        .week-agenda-weekday {
          width: 88px;
          font-size: 14px;
          font-weight: 600;
        }
        .week-agenda-focus {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          font-size: 13px;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
