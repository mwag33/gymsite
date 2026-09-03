// Full month grid, folded directly into HomePage. Each cell is a small
// PlateRing (notches=0 - a full plate doesn't read cleanly this small, see
// PlateRing.tsx) wrapping the date number, plus a tiny FocusIcon badge for
// training type. Aligned to real weekdays (padded with blank leading/
// trailing cells). Tapping a cell opens DayEditSheet inline (see HomePage) -
// no navigation, no accept step, no redirect chain.
import type { DaySession, TrainingPlanFocus } from "../../lib/types";
import { addDaysToKey, daysInMonth, parseLocalDateKey, startOfMonthKey } from "./planDate";
import { FocusIcon } from "./focusIcons";
import { dayViewFor } from "./daySessionsRange";
import PlateRing from "../../components/PlateRing";

interface MonthAgendaProps {
  byDate: Record<string, DaySession>;
  pattern: TrainingPlanFocus[] | null;
  today: string;
  monthAnchor: string; // any date within the month to display
  weekStartsOn?: number; // 0 = Sunday .. 6 = Saturday
  onSelectDate: (date: string) => void;
}

function cellRing(status: ReturnType<typeof dayViewFor>["status"]): { fillPercent: number; color: string } {
  switch (status) {
    case "done":
      return { fillPercent: 1, color: "var(--success)" };
    case "in_progress":
      return { fillPercent: 0.5, color: "var(--accent)" };
    default:
      return { fillPercent: 0, color: "var(--border)" };
  }
}

export default function MonthAgenda({
  byDate,
  pattern,
  today,
  monthAnchor,
  weekStartsOn = 1,
  onSelectDate,
}: MonthAgendaProps) {
  const monthStart = startOfMonthKey(monthAnchor);
  const total = daysInMonth(monthAnchor);
  const dates = Array.from({ length: total }, (_, i) => addDaysToKey(monthStart, i));
  const leadingPad = (parseLocalDateKey(monthStart).getDay() - weekStartsOn + 7) % 7;

  const cells: (string | null)[] = [...Array.from({ length: leadingPad }, () => null), ...dates];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="month-agenda card">
      <div className="month-agenda-grid">
        {cells.map((date, i) => {
          if (!date) return <span key={`pad-${i}`} className="month-agenda-cell month-agenda-cell-empty" />;
          const isToday = date === today;
          const view = dayViewFor(date, byDate[date], pattern);
          const isRest = view.focus === "rest" && !view.displayCategory;
          const ring = isRest ? { fillPercent: 0, color: "var(--border)" } : cellRing(view.status);
          const dayNum = parseLocalDateKey(date).getDate();
          return (
            <button
              key={date}
              type="button"
              className={"month-agenda-cell" + (isToday ? " month-agenda-cell-today" : "")}
              onClick={() => onSelectDate(date)}
            >
              <PlateRing
                size={34}
                notches={0}
                fillPercent={ring.fillPercent}
                color={ring.color}
                holeColor="var(--surface-raised)"
                label={<span className="month-agenda-cell-num tnum">{dayNum}</span>}
              />
              {view.displayCategory && (
                <FocusIcon focus={view.displayCategory} width={11} height={11} className="month-agenda-cell-icon" />
              )}
            </button>
          );
        })}
      </div>

      <style>{`
        .month-agenda {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .month-agenda-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: var(--space-1);
        }
        .month-agenda-cell {
          aspect-ratio: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1px;
          border-radius: var(--radius-sm);
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
        }
        .month-agenda-cell-num {
          font-size: 11px;
          font-weight: 600;
        }
        .month-agenda-cell-icon {
          opacity: 0.85;
        }
        .month-agenda-cell-empty {
          cursor: default;
        }
        .month-agenda-cell-today {
          border-color: var(--accent);
        }
      `}</style>
    </div>
  );
}
