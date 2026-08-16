// Horizontal, scroll-snapped row of day chips (weekday letter, day number,
// status dot). Tapping a chip navigates to /session/:date.
import { useNavigate } from "react-router-dom";
import type { Session, SessionStatus } from "../../lib/types";
import { dayOfMonth, weekdayLetter } from "./planDate";

interface DateStripProps {
  sessions: Session[];
  today: string;
}

const STATUS_DOT_CLASS: Record<SessionStatus, string> = {
  upcoming: "date-strip-dot-upcoming",
  done: "date-strip-dot-done",
  partial: "date-strip-dot-done",
  skipped: "date-strip-dot-missed",
  swapped: "date-strip-dot-swapped",
};

export default function DateStrip({ sessions, today }: DateStripProps) {
  const navigate = useNavigate();
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="date-strip" role="list">
      {sorted.map((session) => {
        const isToday = session.date === today;
        const isRest = session.focus === "rest";
        return (
          <button
            key={session.id}
            type="button"
            role="listitem"
            className={"date-strip-chip" + (isToday ? " date-strip-chip-today" : "")}
            onClick={() => navigate(`/session/${session.date}`)}
          >
            <span className="date-strip-weekday">{weekdayLetter(session.date)}</span>
            <span className="date-strip-daynum tnum">{dayOfMonth(session.date)}</span>
            {!isRest && <span className={"date-strip-dot " + STATUS_DOT_CLASS[session.status]} aria-hidden />}
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
        .date-strip-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--border);
        }
        .date-strip-dot-upcoming {
          background: var(--border);
        }
        .date-strip-dot-done {
          background: var(--success);
        }
        .date-strip-dot-missed {
          background: var(--danger);
        }
        .date-strip-dot-swapped {
          background: transparent;
          border: 1.5px solid var(--accent);
          width: 5px;
          height: 5px;
        }
      `}</style>
    </div>
  );
}
