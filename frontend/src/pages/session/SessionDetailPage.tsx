import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveGym } from "../../contexts/ActiveGymContext";
import type { Machine, PlanDoc, Session, WorkoutLog } from "../../lib/types";
import { weekdayLabel } from "../../features/plan/planDate";
import { FOCUS_LABELS } from "../../features/plan/planFocus";
import AdjustmentBanner from "../../features/plan/AdjustmentBanner";
import SessionExerciseRow from "../../features/plan/SessionExerciseRow";
import SessionEditor from "../../features/plan/SessionEditor";
import { resolveSessionCompletion } from "../../features/plan/sessionCompletion";

const STATUS_LABELS: Record<Session["status"], string> = {
  upcoming: "Upcoming",
  done: "Done",
  partial: "Partial",
  skipped: "Skipped",
  swapped: "Swapped",
};

export default function SessionDetailPage() {
  const { user } = useAuth();
  const { activeGym } = useActiveGym();
  const navigate = useNavigate();
  const { date } = useParams<{ date: string }>();

  const [plan, setPlan] = useState<PlanDoc | null | undefined>(undefined);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid, "plans", "current"), (snap) => {
      setPlan(snap.exists() ? (snap.data() as PlanDoc) : null);
    });
  }, [user]);

  const session = plan?.sessions.find((s) => s.date === date) ?? null;

  useEffect(() => {
    if (!user || !session) {
      setLogs([]);
      return;
    }
    const logsQuery = query(
      collection(db, "users", user.uid, "workoutLogs"),
      where("plannedSessionId", "==", session.id)
    );
    return onSnapshot(logsQuery, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkoutLog, "id">) })));
    });
  }, [user, session]);

  useEffect(() => {
    if (!activeGym) {
      setMachines([]);
      return;
    }
    return onSnapshot(collection(db, "gyms", activeGym.id, "machines"), (snap) => {
      setMachines(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Machine));
    });
  }, [activeGym]);

  if (plan === undefined) {
    return <div className="card">Loading session...</div>;
  }

  if (!session || !date) {
    return (
      <div className="card">
        <p>No session found for this date.</p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>
          Back to Home
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <SessionEditor
        session={session}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  const exercises = session.exercises ?? [];
  const completion = resolveSessionCompletion(exercises, logs, machines);
  // AdjustmentBanner already renders `note` verbatim as the reschedule
  // reason for an adjusted session — don't render it a second time here.
  const isAdjusted = session.source === "deterministic_reschedule" || Boolean(session.rescheduledFromSessionId);

  return (
    <div className="session-detail">
      <div className="session-detail-header">
        <div>
          <p className="session-detail-date">{weekdayLabel(session.date)}</p>
          <h1 className="session-detail-focus">{FOCUS_LABELS[session.focus]}</h1>
        </div>
        <span className={`session-detail-badge session-detail-badge-${session.status}`}>
          {STATUS_LABELS[session.status]}
        </span>
      </div>

      <AdjustmentBanner session={session} />

      {!isAdjusted && session.note && <p className="session-detail-note">{session.note}</p>}

      {exercises.length > 0 ? (
        <ul className="session-detail-exercises">
          {exercises.map((ex) => (
            <SessionExerciseRow key={ex.id} exercise={ex} completion={completion.get(ex.id)} />
          ))}
        </ul>
      ) : session.exercises === null ? (
        <p className="session-detail-empty">Exercises for this session haven't been generated yet.</p>
      ) : (
        <p className="session-detail-empty">Rest day — nothing planned.</p>
      )}

      <div className="session-detail-actions">
        <button
          type="button"
          className="btn btn-primary session-detail-btn"
          onClick={() => navigate(`/log/${session.date}`)}
        >
          Log this session
        </button>
        <button
          type="button"
          className="btn btn-secondary session-detail-btn"
          onClick={() => setEditing(true)}
        >
          Edit just this day
        </button>
      </div>

      <style>{`
        .session-detail {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .session-detail-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-3);
        }
        .session-detail-date {
          margin: 0;
          font-size: 13px;
          color: var(--text-muted);
        }
        .session-detail-focus {
          font-size: 22px;
        }
        .session-detail-badge {
          flex-shrink: 0;
          font-size: 12px;
          font-weight: 600;
          padding: var(--space-1) var(--space-3);
          border-radius: 999px;
          background: var(--surface-raised);
          border: 1px solid var(--border);
          color: var(--text-muted);
        }
        .session-detail-badge-done {
          color: var(--success);
          border-color: var(--success);
        }
        .session-detail-badge-partial {
          color: var(--accent);
          border-color: var(--accent);
        }
        .session-detail-badge-skipped {
          color: var(--danger);
          border-color: var(--danger);
        }
        .session-detail-badge-swapped {
          color: var(--accent);
          border-color: var(--accent);
        }
        .session-detail-note {
          font-size: 14px;
          color: var(--text-muted);
        }
        .session-detail-exercises {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .session-detail-empty {
          color: var(--text-muted);
          font-size: 14px;
        }
        .session-detail-actions {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          position: sticky;
          bottom: 0;
          padding-top: var(--space-2);
        }
        .session-detail-btn {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
