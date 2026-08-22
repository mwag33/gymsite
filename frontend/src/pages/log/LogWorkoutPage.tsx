// Thin get-or-create redirect: the bottom-nav "/log" and "/log/:date" URL
// contract is unchanged, but the actual session-first logging UI now lives
// at /session/:sessionId (SessionTrackerPage). This page just resolves which
// tracked session (if any) the target date should open, or sends the user to
// /day/:date to accept a suggestion or choose among several tracked sessions.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveGym } from "../../contexts/ActiveGymContext";
import { toLocalDateKey } from "../../features/plan/planDate";
import type { TrackedSession } from "../../lib/types";
import { SimpleLogView } from "./SimpleLogView";

export default function LogWorkoutPage() {
  const { user } = useAuth();
  const { activeGym } = useActiveGym();
  const navigate = useNavigate();
  const { date: dateParam } = useParams<{ date?: string }>();
  const today = useMemo(() => toLocalDateKey(new Date()), []);
  const targetDate = dateParam ?? today;

  const [tracked, setTracked] = useState<TrackedSession[] | undefined>(undefined);
  const [justLogged, setJustLogged] = useState(false);

  useEffect(() => {
    if (!user) return;
    setTracked(undefined);
    return onSnapshot(
      query(collection(db, "users", user.uid, "trackedSessions"), where("date", "==", targetDate)),
      (snap) => setTracked(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TrackedSession, "id">) })))
    );
  }, [user, targetDate]);

  useEffect(() => {
    if (!user || !activeGym || !tracked) return;
    if (tracked.length === 1) {
      navigate(`/session/${tracked[0].id}`, { replace: true });
    } else {
      // 0 tracked sessions (needs /day to accept a suggestion or start ad
      // hoc) or >1 (needs /day to pick which one) both resolve to the same
      // place - DayDetailPage lists every case.
      navigate(`/day/${targetDate}`, { replace: true });
    }
  }, [user, activeGym, tracked, targetDate, navigate]);

  if (!user) return null;

  if (!activeGym) {
    return (
      <div className="log-page">
        {justLogged && (
          <div className="card log-status-card" role="status">
            <p className="log-status-line">Workout logged</p>
          </div>
        )}
        <SimpleLogView uid={user.uid} gymId={null} onLogged={() => setJustLogged(true)} />
        <style>{`
          .log-page {
            display: flex;
            flex-direction: column;
            gap: var(--space-4);
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
        `}</style>
      </div>
    );
  }

  return <div className="card">Loading...</div>;
}
