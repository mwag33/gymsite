// Full month grid, folded directly into HomePage (the app's one "when am I
// training" surface - see the design plan's IA simplification). Each cell
// is a small PlateRing (notches=0 - a full plate doesn't read cleanly this
// small, see PlateRing.tsx) wrapping the date number, plus a tiny FocusIcon
// badge for training type. Aligned to real weekdays (padded with blank
// leading/trailing cells), colored per merged status (a tracked session
// overrides the plan suggestion's status - see mergeDaySessions), click
// navigates to /day/:date.
import { useNavigate } from "react-router-dom";
import type { Session, TrackedSession } from "../../lib/types";
import { parseLocalDateKey } from "./planDate";
import { FocusIcon } from "./focusIcons";
import { mergeDaySessions, summarizeDayStatus } from "./mergeSessions";
import PlateRing from "../../components/PlateRing";

interface MonthAgendaProps {
  sessions: Session[];
  trackedSessions?: TrackedSession[];
  today: string;
  weekStartsOn?: number; // 0 = Sunday .. 6 = Saturday
  onClose?: () => void;
}

function cellRing(status: ReturnType<typeof summarizeDayStatus>): { fillPercent: number; color: string } {
  switch (status) {
    case "done":
      return { fillPercent: 1, color: "var(--success)" };
    case "in_progress":
    case "partial":
    case "swapped":
      return { fillPercent: 0.5, color: "var(--accent)" };
    case "skipped":
      return { fillPercent: 1, color: "var(--danger)" };
    default:
      return { fillPercent: 0, color: "var(--border)" };
  }
}

export default function MonthAgenda({
  sessions,
  trackedSessions = [],
  today,
  weekStartsOn = 1,
  onClose,
}: MonthAgendaProps) {
  const navigate = useNavigate();
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) {
    return (
      <div className="month-agenda card">
        <p>No sessions scheduled yet.</p>
        {onClose && (
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        )}
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
        {onClose && (
          <button type="button" className="month-agenda-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        )}
      </div>
      <div className="month-agenda-grid">
        {cells.map((session, i) => {
          if (!session) return <span key={`pad-${i}`} className="month-agenda-cell month-agenda-cell-empty" />;
          const isToday = session.date === today;
          const isRest = session.focus === "rest";
          const view = mergeDaySessions(sessions, trackedSessions, session.date);
          const mergedStatus = summarizeDayStatus(view);
          const ring = cellRing(isRest ? null : mergedStatus);
          const dayNum = parseLocalDateKey(session.date).getDate();
          return (
            <button
              key={session.id}
              type="button"
              className={"month-agenda-cell" + (isToday ? " month-agenda-cell-today" : "")}
              onClick={() => navigate(`/day/${session.date}`)}
            >
              <PlateRing
                size={34}
                notches={0}
                fillPercent={ring.fillPercent}
                color={ring.color}
                holeColor="var(--surface-raised)"
                label={<span className="month-agenda-cell-num tnum">{dayNum}</span>}
              />
              {!isRest && <FocusIcon focus={session.focus} width={11} height={11} className="month-agenda-cell-icon" />}
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

