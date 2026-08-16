import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveGym } from "../../contexts/ActiveGymContext";
import type { Machine, PlanDoc, Session, TrainingPlanFocus, WorkoutLog } from "../../lib/types";
import { weekdayLabel } from "../../features/plan/planDate";
import { EDITABLE_FOCUS_OPTIONS, FOCUS_LABELS } from "../../features/plan/planFocus";
import { FocusIcon } from "../../features/plan/focusIcons";
import AdjustmentBanner from "../../features/plan/AdjustmentBanner";
import SessionExerciseRow from "../../features/plan/SessionExerciseRow";
import SessionEditor from "../../features/plan/SessionEditor";
import { resolveSessionCompletion } from "../../features/plan/sessionCompletion";
import { updateSession, regenerateSessionExercises } from "../../lib/callables";

const STATUS_LABELS: Record<Session["status"], string> = {
  upcoming: "Upcoming",
  done: "Done",
  partial: "Partial",
  skipped: "Skipped",
  swapped: "Swapped",
};

export default function SessionDetailPage() {
  const { user, profile } = useAuth();
  const { activeGym } = useActiveGym();
  const navigate = useNavigate();
  const { date } = useParams<{ date: string }>();

  const [plan, setPlan] = useState<PlanDoc | null | undefined>(undefined);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [editing, setEditing] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [savingFocus, setSavingFocus] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

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

  // A swap patches `focus` alone (see handleSwapFocus) and deliberately
  // leaves the old exercises in place rather than clearing them - so an
  // exercise's machineCategory (set from the session's focus at generation
  // time, see functions/src/generateExercisesForWeek.ts) no longer matching
  // the day's current focus is exactly the signal that regeneration is due.
  const hasStaleExercises =
    exercises.length > 0 && exercises.some((ex) => ex.machineCategory !== session.focus);

  async function handleSwapFocus(newFocus: TrainingPlanFocus) {
    if (newFocus === session!.focus || savingFocus) return;
    setSavingFocus(true);
    setSwapError(null);
    try {
      await updateSession({
        sessionId: session!.id,
        // Rest days deliberately carry `[]` (nothing to log), never `null`
        // ("not yet generated") - swapping onto rest applies that sentinel
        // directly instead of leaving stale exercises behind.
        patch: newFocus === "rest" ? { focus: newFocus, exercises: [] } : { focus: newFocus },
      });
      setSwapping(false);
    } catch (err) {
      setSwapError(err instanceof Error ? err.message : "Couldn't change this day's type.");
    } finally {
      setSavingFocus(false);
    }
  }

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    setRegenError(null);
    try {
      await regenerateSessionExercises({
        sessionId: session!.id,
        experience: profile?.experienceLevel ?? "some_experience",
        sessionLengthMinutes: profile?.sessionLengthMinutes ?? 45,
        gymId: activeGym?.id ?? null,
        equipmentNotes: profile?.equipmentNotes ?? undefined,
        injuryNotes: profile?.injuryNotes ?? undefined,
      });
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Couldn't regenerate exercises. Please try again.");
    } finally {
      setRegenerating(false);
    }
  }

  // AdjustmentBanner already renders `note` verbatim as the reschedule
  // reason for an adjusted session — don't render it a second time here.
  const isAdjusted = session.source === "deterministic_reschedule" || Boolean(session.rescheduledFromSessionId);

  return (
    <div className="session-detail">
      <div className="session-detail-header">
        <div>
          <p className="session-detail-date">{weekdayLabel(session.date)}</p>
          <button
            type="button"
            className="session-detail-focus-btn"
            onClick={() => setSwapping((v) => !v)}
          >
            <FocusIcon focus={session.focus} width={20} height={20} />
            <h1 className="session-detail-focus">{FOCUS_LABELS[session.focus]}</h1>
            <span className="session-detail-focus-edit">{swapping ? "Cancel" : "Change"}</span>
          </button>
        </div>
        <span className={`session-detail-badge session-detail-badge-${session.status}`}>
          {STATUS_LABELS[session.status]}
        </span>
      </div>

      {swapping && (
        <div className="session-detail-swap" role="list">
          {EDITABLE_FOCUS_OPTIONS.map((focus) => (
            <button
              key={focus}
              type="button"
              role="listitem"
              className={
                "session-detail-swap-chip" + (focus === session.focus ? " session-detail-swap-chip-active" : "")
              }
              disabled={savingFocus}
              onClick={() => void handleSwapFocus(focus)}
            >
              <FocusIcon focus={focus} width={14} height={14} />
              {FOCUS_LABELS[focus]}
            </button>
          ))}
        </div>
      )}
      {swapError && <p className="session-detail-error">{swapError}</p>}

      {hasStaleExercises && (
        <div className="session-detail-stale">
          <p>Exercises below are for the old focus.</p>
          <button
            type="button"
            className="btn btn-secondary session-detail-regen-btn"
            disabled={regenerating}
            onClick={() => void handleRegenerate()}
          >
            {regenerating ? "Regenerating…" : "Regenerate exercises"}
          </button>
          {regenError && <p className="session-detail-error">{regenError}</p>}
        </div>
      )}

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
        .session-detail-focus-btn {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          background: none;
          border: none;
          padding: 0;
          color: var(--text);
          cursor: pointer;
        }
        .session-detail-focus-edit {
          font-size: 12px;
          font-weight: 600;
          color: var(--accent);
        }
        .session-detail-swap {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }
        .session-detail-swap-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-2) var(--space-3);
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .session-detail-swap-chip-active {
          border-color: var(--accent);
          background: var(--accent-surface);
          color: var(--accent);
        }
        .session-detail-swap-chip:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .session-detail-error {
          color: var(--danger);
          font-size: 13px;
        }
        .session-detail-stale {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: var(--space-2);
          padding: var(--space-3);
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 13px;
          color: var(--text-muted);
        }
        .session-detail-regen-btn {
          font-size: 13px;
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
