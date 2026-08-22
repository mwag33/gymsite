// Next few training-focus sessions (rest days excluded). Each row navigates
// to /day/:date (the day-detail view, which resolves to whatever mix of
// tracked sessions/suggestion that date has); a "See full month" link opens
// the promoted /calendar route.
import { useNavigate } from "react-router-dom";
import type { Session } from "../../lib/types";
import { FOCUS_LABELS } from "./planFocus";
import { shortDateLabel } from "./planDate";
import { FocusBadge } from "./focusIcons";

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
                onClick={() => navigate(`/day/${session.date}`)}
              >
                <span className="upcoming-list-date">{shortDateLabel(session.date)}</span>
                <span className="upcoming-list-main">
                  <FocusBadge session={session} size={22} />
                  <span className="upcoming-list-focus">{FOCUS_LABELS[session.focus]}</span>
                </span>
                <span className="upcoming-list-count">
                  {session.exercises === null
                    ? "Not planned yet"
                    : `${session.exercises.length} exercise${session.exercises.length === 1 ? "" : "s"}`}
                </span>
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
          gap: var(--space-3);
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
          flex-shrink: 0;
          width: 44px;
          color: var(--text-muted);
          font-size: 13px;
        }
        .upcoming-list-main {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .upcoming-list-focus {
          font-weight: 600;
        }
        .upcoming-list-count {
          flex-shrink: 0;
          color: var(--text-muted);
          font-size: 12px;
          text-align: right;
        }
      `}</style>
    </div>
  );
}
