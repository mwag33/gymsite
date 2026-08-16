import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveGym } from "../../contexts/ActiveGymContext";
import { toLocalDateKey } from "../../features/plan/planDate";
import type { ExerciseEntry, PlanDoc } from "../../lib/types";
import { SimpleLogView } from "./SimpleLogView";
import SessionLogList from "./SessionLogList";
import CatalogLogView from "./CatalogLogView";

export default function LogWorkoutPage() {
  const { user } = useAuth();
  const { activeGym } = useActiveGym();
  const navigate = useNavigate();
  const { date: dateParam } = useParams<{ date?: string }>();

  const [plan, setPlan] = useState<PlanDoc | null | undefined>(undefined);
  const [showCatalog, setShowCatalog] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [logGeneration, setLogGeneration] = useState(0);
  const [justLogged, setJustLogged] = useState(false);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid, "plans", "current"), (snap) => {
      setPlan(snap.exists() ? (snap.data() as PlanDoc) : null);
    });
  }, [user]);

  const today = toLocalDateKey(new Date());
  const targetDate = dateParam ?? today;

  // Covers navigation into a different date that doesn't go through
  // handleDateChange (e.g. a "Log this session" link from SessionDetailPage) —
  // the confirmation banner shouldn't survive a change of logging target.
  useEffect(() => {
    setJustLogged(false);
    setShowCatalog(false);
  }, [targetDate]);

  function handleDateChange(next: string) {
    navigate(next === today ? "/log" : `/log/${next}`);
  }

  async function handleFinishSession(exercises: ExerciseEntry[]) {
    if (!user || !activeGym || exercises.length === 0) return;
    const session = plan?.sessions.find((s) => s.date === targetDate);
    setFinishing(true);
    setFinishError(null);
    try {
      await addDoc(collection(db, "users", user.uid, "workoutLogs"), {
        mode: "detailed" as const,
        gymId: activeGym.id,
        date: Timestamp.now(),
        exercises,
        createdAt: serverTimestamp(),
        plannedSessionId: session?.id ?? null,
      });
      setJustLogged(true);
      setLogGeneration((g) => g + 1);
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : "Couldn't save your workout. Please try again.");
    } finally {
      setFinishing(false);
    }
  }

  function handleCatalogLogged() {
    setJustLogged(true);
    setShowCatalog(false);
  }

  if (!user) return null;

  const showFallback = !activeGym || plan === null;
  const session = plan?.sessions.find((s) => s.date === targetDate) ?? null;

  return (
    <div className="log-page">
      <div className="log-date-row">
        <label className="log-date-picker">
          <span className="log-date-picker-label">Logging for</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => e.target.value && handleDateChange(e.target.value)}
          />
        </label>
      </div>

      {justLogged && (
        <div className="card log-status-card" role="status">
          <p className="log-status-line">Workout logged</p>
        </div>
      )}

      {plan === undefined ? (
        <div className="card">Loading your plan...</div>
      ) : showCatalog ? (
        <CatalogLogView
          uid={user.uid}
          activeGym={activeGym}
          onLogged={handleCatalogLogged}
          onClose={() => setShowCatalog(false)}
        />
      ) : showFallback ? (
        <SimpleLogView
          uid={user.uid}
          gymId={activeGym?.id ?? null}
          onLogged={() => setJustLogged(true)}
        />
      ) : session ? (
        <SessionLogList
          key={`${session.id}-${logGeneration}`}
          uid={user.uid}
          gymId={activeGym!.id}
          session={session}
          onLogSomethingElse={() => setShowCatalog(true)}
          onFinish={handleFinishSession}
          finishing={finishing}
          finishError={finishError}
        />
      ) : (
        <div className="card log-empty-state">
          <p>No planned session for this date.</p>
          <button type="button" className="btn btn-secondary" onClick={() => setShowCatalog(true)}>
            Log something else
          </button>
        </div>
      )}

      <style>{`
        .log-page {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .log-date-row {
          display: flex;
          justify-content: flex-end;
        }
        .log-date-picker {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: 13px;
          color: var(--text-muted);
        }
        .log-date-picker input {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text);
          padding: var(--space-1) var(--space-2);
        }

        .log-status-card {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .log-status-line {
          font-weight: 600;
          color: var(--success);
        }

        .log-category-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-3);
        }
        .log-category-card {
          padding: var(--space-5) var(--space-3);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-size: 15px;
          font-weight: 600;
          text-align: center;
          cursor: pointer;
        }
        .log-category-card-active {
          border-color: var(--accent);
          background: var(--surface-raised);
          color: var(--accent);
        }

        .log-confirm-panel {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .log-confirm-title {
          font-size: 18px;
          font-weight: 600;
        }
        .log-confirm-date {
          color: var(--text-muted);
          font-size: 14px;
        }
        .log-confirm-actions {
          display: flex;
          gap: var(--space-2);
          justify-content: flex-end;
        }
        .log-error-text {
          color: var(--danger);
          font-size: 13px;
        }

        .log-detailed {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .log-no-gym {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          align-items: flex-start;
        }
        .log-catalog-back {
          align-self: flex-start;
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 13px;
          cursor: pointer;
          padding: 0;
        }
        .log-search-input {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text);
          padding: var(--space-2) var(--space-3);
          width: 100%;
        }
        .log-empty-state {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          align-items: flex-start;
        }
        .log-status-muted {
          color: var(--text-muted);
          font-size: 14px;
        }

        .log-session-summary {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-3);
        }
        .log-session-summary-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .log-session-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 14px;
          gap: var(--space-2);
        }
        .log-session-item-actions {
          display: flex;
          gap: var(--space-3);
          flex-shrink: 0;
        }
        .log-session-item-btn {
          background: none;
          border: none;
          color: var(--accent);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
        }

        .log-machine-group {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .log-machine-group-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .log-machine-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .log-machine-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          color: var(--text);
          font-size: 15px;
          text-align: left;
          cursor: pointer;
        }
        .log-machine-added-badge {
          font-size: 12px;
          font-weight: 600;
          color: var(--accent);
        }

        .log-set-panel {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .log-set-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .log-set-panel-title {
          font-size: 18px;
          font-weight: 600;
        }
        .log-panel-close {
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
          padding: 0;
        }
        .log-same-as-last-btn {
          align-self: flex-start;
          font-size: 13px;
        }
        .log-set-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .log-set-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          flex-wrap: wrap;
        }
        .log-set-index {
          font-size: 13px;
          color: var(--text-muted);
          min-width: 44px;
        }
        .log-stepper {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: var(--space-1) var(--space-2);
        }
        .log-stepper button {
          width: 26px;
          height: 26px;
          border-radius: var(--radius-sm);
          border: none;
          background: var(--surface);
          color: var(--text);
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        }
        .log-stepper-value {
          min-width: 64px;
          text-align: center;
          font-size: 14px;
          font-weight: 600;
        }
        .log-set-remove {
          background: none;
          border: none;
          color: var(--danger);
          font-size: 13px;
          cursor: pointer;
          padding: 0;
        }
        .log-add-set-btn,
        .log-save-exercise-btn,
        .log-finish-btn {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
