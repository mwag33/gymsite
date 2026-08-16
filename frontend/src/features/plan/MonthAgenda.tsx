// Compact calendar grid for peeking further into the rolling month: each
// cell pairs the date number with a small FocusIcon (training-type glyph),
// matching the icon treatment DateStrip/UpcomingList already use for the
// weekly view. Aligned to real weekdays (padded with blank leading/trailing
// cells), colored per session status, click navigates to /session/:date.
import { useNavigate } from "react-router-dom";
import type { Session, SessionStatus } from "../../lib/types";
import { parseLocalDateKey } from "./planDate";
import { FocusIcon } from "./focusIcons";

interface MonthAgendaProps {
  sessions: Session[];
  today: string;
  weekStartsOn?: number; // 0 = Sunday .. 6 = Saturday
  onClose: () => void;
}

const STATUS_CLASS: Record<SessionStatus, string> = {
  upcoming: "month-agenda-cell-upcoming",
  done: "month-agenda-cell-done",
  partial: "month-agenda-cell-done",
  skipped: "month-agenda-cell-missed",
  swapped: "month-agenda-cell-swapped",
};

export default function MonthAgenda({ sessions, today, weekStartsOn = 1, onClose }: MonthAgendaProps) {
  const navigate = useNavigate();
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) {
    return (
      <div className="month-agenda card">
        <p>No sessions scheduled yet.</p>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  const firstDate = sorted[0].date;
  const leadingPad = (parseLocalDateKey(firstDate).getDay() - weekStartsOn + 7) % 7;

  const cells: (Session | null)[] = [
    ...Array.from({ length: leadingPad }, () => null),
    ...sorted,
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="month-agenda card">
      <div className="month-agenda-header">
        <h3>This month</h3>
        <button type="button" className="month-agenda-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>
      <div className="month-agenda-grid">
        {cells.map((session, i) => {
          if (!session) return <span key={`pad-${i}`} className="month-agenda-cell month-agenda-cell-empty" />;
          const isToday = session.date === today;
          const isRest = session.focus === "rest";
          return (
            <button
              key={session.id}
              type="button"
              className={
                "month-agenda-cell" +
                (isToday ? " month-agenda-cell-today" : "") +
                (!isRest ? ` ${STATUS_CLASS[session.status]}` : "")
              }
              onClick={() => navigate(`/session/${session.date}`)}
            >
              <span className="month-agenda-cell-num tnum">{parseLocalDateKey(session.date).getDate()}</span>
              {!isRest && <FocusIcon focus={session.focus} width={12} height={12} className="month-agenda-cell-icon" />}
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
        .month-agenda-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .month-agenda-header h3 {
          font-size: 15px;
        }
        .month-agenda-close {
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          padding: 0;
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
          gap: 2px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--surface-raised);
          color: var(--text-muted);
          cursor: pointer;
        }
        .month-agenda-cell-num {
          font-size: 11px;
        }
        .month-agenda-cell-icon {
          opacity: 0.85;
        }
        .month-agenda-cell-empty {
          border-color: transparent;
          background: transparent;
          cursor: default;
        }
        .month-agenda-cell-today {
          border-color: var(--accent);
          font-weight: 700;
          color: var(--text);
        }
        .month-agenda-cell-done {
          background: color-mix(in srgb, var(--success) 18%, var(--surface-raised));
          color: var(--text);
        }
        .month-agenda-cell-missed {
          background: color-mix(in srgb, var(--danger) 18%, var(--surface-raised));
          color: var(--text);
        }
        .month-agenda-cell-swapped {
          border-color: var(--accent);
          color: var(--text);
        }
        .month-agenda-cell-upcoming {
          color: var(--text);
        }
      `}</style>
    </div>
  );
}

