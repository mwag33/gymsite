// Horizontal, scroll-snapped row of day chips (weekday letter, day number,
// focus icon badge). Tapping a chip navigates to /day/:date.
import { useNavigate } from "react-router-dom";
import type { Session } from "../../lib/types";
import { dayOfMonth, weekdayLetter } from "./planDate";
import { FocusBadge } from "./focusIcons";
import { FOCUS_LABELS } from "./planFocus";

interface DateStripProps {
  sessions: Session[];
  today: string;
}

const STATUS_WORD: Record<Session["status"], string> = {
  upcoming: "planned",
  done: "done",
  partial: "partially done",
  skipped: "missed",
  swapped: "swapped",
};

export default function DateStrip({ sessions, today }: DateStripProps) {
  const navigate = useNavigate();
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="date-strip" role="list">
      {sorted.map((session) => {
        const isToday = session.date === today;
        const isRest = session.focus === "rest";
        const label = `${FOCUS_LABELS[session.focus]}${isRest ? "" : `, ${STATUS_WORD[session.status]}`}`;
        return (
          <button
            key={session.id}
            type="button"
            role="listitem"
            className={"date-strip-chip" + (isToday ? " date-strip-chip-today" : "")}
            onClick={() => navigate(`/day/${session.date}`)}
            title={label}
            aria-label={`${weekdayLetter(session.date)} ${dayOfMonth(session.date)}: ${label}`}
          >
            <span className="date-strip-weekday">{weekdayLetter(session.date)}</span>
            <span className="date-strip-daynum tnum">{dayOfMonth(session.date)}</span>
            <FocusBadge session={session} size={20} />
          </button>
        );
      })}

      <style>{`
        .date-strip {
          display: flex;
          gap: var(--space-2);
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          padding-bottom: var(--space-1);
          -webkit-overflow-scrolling: touch;
        }
        .date-strip::-webkit-scrollbar {
          display: none;
        }
        .date-strip-chip {
          scroll-snap-align: start;
          flex-shrink: 0;
          width: 44px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: var(--space-2) 0;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text);
          cursor: pointer;
        }
        .date-strip-chip-today {
          background: var(--accent-surface);
          border-color: var(--accent);
        }
        .date-strip-weekday {
          font-size: 11px;
          color: var(--text-muted);
        }
        .date-strip-daynum {
          font-size: 15px;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
