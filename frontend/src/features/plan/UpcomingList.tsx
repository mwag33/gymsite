// Next few training-focus sessions (rest days excluded). Each row navigates
// to /session/:date; a "See full month" link opens MonthAgenda.
import { useNavigate } from "react-router-dom";
import type { Session } from "../../lib/types";
import { FOCUS_LABELS } from "./planFocus";
import { shortDateLabel } from "./planDate";

interface UpcomingListProps {
  sessions: Session[];
  today: string;
  onOpenMonth: () => void;
  limit?: number;
}

export default function UpcomingList({ sessions, today, onOpenMonth, limit = 5 }: UpcomingListProps) {
  const navigate = useNavigate();
  const upcoming = sessions
    .filter((s) => s.focus !== "rest" && s.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);

  return (
    <div className="upcoming-list">
      <div className="upcoming-list-header">
        <h3>Upcoming</h3>
        <button type="button" className="upcoming-list-month-link" onClick={onOpenMonth}>
          See full month
        </button>
      </div>

      {upcoming.length === 0 ? (
        <p className="upcoming-list-empty">Nothing else scheduled yet.</p>
      ) : (
        <ul className="upcoming-list-rows">
          {upcoming.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                className="upcoming-list-row"
                onClick={() => navigate(`/session/${session.date}`)}
              >
                <span className="upcoming-list-date">{shortDateLabel(session.date)}</span>
                <span className="upcoming-list-focus">{FOCUS_LABELS[session.focus]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <style>{`
        .upcoming-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .upcoming-list-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .upcoming-list-header h3 {
          font-size: 15px;
        }
        .upcoming-list-month-link {
          background: none;
          border: none;
          color: var(--accent);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
        }
        .upcoming-list-empty {
          font-size: 14px;
          color: var(--text-muted);
        }
        .upcoming-list-rows {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .upcoming-list-row {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          color: var(--text);
          font-size: 14px;
          cursor: pointer;
          text-align: left;
        }
        .upcoming-list-date {
          color: var(--text-muted);
        }
        .upcoming-list-focus {
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
