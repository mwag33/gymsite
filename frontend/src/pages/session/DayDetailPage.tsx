// Day-detail view at /day/:date - replaces the old date-keyed
// SessionDetailPage now that a date can hold more than one tracked session.
// Lists every trackedSessions doc for the date as a tappable card, plus an
// "Accept" card for an unaccepted PlanDoc suggestion (see mergeDaySessions).
// Suggestion management (swap focus / regenerate / edit-just-this-day) stays
// bound to the PlanDoc session and only shows before it's accepted - once
// accepted, further edits happen on the tracked session itself, in
// SessionTrackerPage.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveGym } from "../../contexts/ActiveGymContext";
import type { PlanDoc, TrackedSession, TrainingPlanFocus } from "../../lib/types";
import { weekdayLabel } from "../../features/plan/planDate";
import { EDITABLE_FOCUS_OPTIONS, FOCUS_LABELS } from "../../features/plan/planFocus";
import { FocusIcon } from "../../features/plan/focusIcons";
import AdjustmentBanner from "../../features/plan/AdjustmentBanner";
import SessionEditor from "../../features/plan/SessionEditor";
import { mergeDaySessions } from "../../features/plan/mergeSessions";
import { acceptPlanSession, createAdHocTrackedSession } from "../../features/tracking/trackedSessionActions";
import { updateSession, regenerateSessionExercises } from "../../lib/callables";

const TRACKED_STATUS_LABEL: Record<TrackedSession["status"], string> = {
  in_progress: "In progress",
  done: "Done",
};

export default function DayDetailPage() {
  const { user, profile } = useAuth();
  const { activeGym } = useActiveGym();
  const navigate = useNavigate();
  const { date } = useParams<{ date: string }>();

  const [plan, setPlan] = useState<PlanDoc | null | undefined>(undefined);
  const [tracked, setTracked] = useState<TrackedSession[] | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [savingFocus, setSavingFocus] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid, "plans", "current"), (snap) => {
      setPlan(snap.exists() ? (snap.data() as PlanDoc) : null);
    });
  }, [user]);

  useEffect(() => {
    if (!user || !date) return;
    return onSnapshot(
      query(collection(db, "users", user.uid, "trackedSessions"), where("date", "==", date)),
      (snap) => setTracked(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TrackedSession, "id">) })))
    );
  }, [user, date]);

  if (plan === undefined || tracked === undefined || !date) {
    return <div className="card">Loading...</div>;
  }

  const view = mergeDaySessions(plan?.sessions ?? [], tracked, date);
  const suggestion = view.unacceptedSuggestion;

  if (editing && suggestion) {
    return <SessionEditor session={suggestion} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />;
  }

  async function handleAccept() {
    if (!user || !suggestion || accepting) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const id = await acceptPlanSession(user.uid, suggestion, activeGym?.id ?? null);
      navigate(`/session/${id}`);
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : "Couldn't start this session. Please try again.");
    } finally {
      setAccepting(false);
    }
  }

  async function handleLogSomethingElse() {
    if (!user) return;
    const id = await createAdHocTrackedSession(user.uid, date!, activeGym?.id ?? null);
    navigate(`/session/${id}`);
  }

  async function handleSwapFocus(newFocus: TrainingPlanFocus) {
    if (!suggestion || newFocus === suggestion.focus || savingFocus) return;
    setSavingFocus(true);
    setSwapError(null);
    try {
      await updateSession({
        sessionId: suggestion.id,
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
    if (!suggestion || regenerating) return;
    setRegenerating(true);
    setRegenError(null);
    try {
      await regenerateSessionExercises({
        sessionId: suggestion.id,
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

  const isAdjusted = Boolean(
    suggestion && (suggestion.source === "deterministic_reschedule" || suggestion.rescheduledFromSessionId)
  );

  return (
    <div className="day-detail">
      <p className="day-detail-date">{weekdayLabel(date)}</p>

      {view.tracked.map((session) => (
        <button
          key={session.id}
          type="button"
          className="card day-detail-tracked-card"
          onClick={() => navigate(`/session/${session.id}`)}
        >
          <FocusIcon focus={session.focus} width={22} height={22} />
          <div className="day-detail-tracked-info">
            <span className="day-detail-tracked-focus">{FOCUS_LABELS[session.focus] ?? session.focus}</span>
            <span className="day-detail-tracked-sub">
              {session.exercises.length} exercise{session.exercises.length === 1 ? "" : "s"}
            </span>
          </div>
          <span className={`day-detail-badge day-detail-badge-${session.status}`}>
            {TRACKED_STATUS_LABEL[session.status]}
          </span>
        </button>
      ))}

      {suggestion && (
        <div className="card day-detail-suggestion">
          <div className="day-detail-suggestion-header">
            <button type="button" className="day-detail-focus-btn" onClick={() => setSwapping((v) => !v)}>
              <FocusIcon focus={suggestion.focus} width={20} height={20} />
              <h1 className="day-detail-focus">{FOCUS_LABELS[suggestion.focus]}</h1>
              <span className="day-detail-focus-edit">{swapping ? "Cancel" : "Change"}</span>
            </button>
          </div>

          {swapping && (
            <div className="day-detail-swap" role="list">
              {EDITABLE_FOCUS_OPTIONS.map((focus) => (
                <button
                  key={focus}
                  type="button"
                  role="listitem"
                  className={"day-detail-swap-chip" + (focus === suggestion.focus ? " day-detail-swap-chip-active" : "")}
                  disabled={savingFocus}
                  onClick={() => void handleSwapFocus(focus)}
                >
                  <FocusIcon focus={focus} width={14} height={14} />
                  {FOCUS_LABELS[focus]}
                </button>
              ))}
            </div>
          )}
          {swapError && <p className="day-detail-error">{swapError}</p>}

          <AdjustmentBanner session={suggestion} />
          {!isAdjusted && suggestion.note && <p className="day-detail-note">{suggestion.note}</p>}

          {suggestion.exercises === null ? (
            <p className="day-detail-empty">Exercises for this session haven't been generated yet.</p>
          ) : suggestion.exercises.length > 0 ? (
            <p className="day-detail-empty">
              {suggestion.exercises.length} exercise{suggestion.exercises.length === 1 ? "" : "s"} planned:{" "}
              {suggestion.exercises.map((ex) => ex.name).join(", ")}
            </p>
          ) : (
            <p className="day-detail-empty">Rest day — nothing planned.</p>
          )}
          {regenError && <p className="day-detail-error">{regenError}</p>}
          {acceptError && <p className="day-detail-error">{acceptError}</p>}

          <div className="day-detail-actions">
            <button type="button" className="btn btn-primary day-detail-btn" disabled={accepting} onClick={() => void handleAccept()}>
              {accepting ? "Starting..." : "Accept & start"}
            </button>
            <button
              type="button"
              className="btn btn-secondary day-detail-btn"
              disabled={regenerating}
              onClick={() => void handleRegenerate()}
            >
              {regenerating ? "Regenerating…" : "Regenerate exercises"}
            </button>
            <button type="button" className="btn btn-secondary day-detail-btn" onClick={() => setEditing(true)}>
              Edit just this day
            </button>
          </div>
        </div>
      )}

      <button type="button" className="btn btn-secondary day-detail-log-else" onClick={() => void handleLogSomethingElse()}>
        Log something else
      </button>

      <style>{`
        .day-detail {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .day-detail-date {
          margin: 0;
          font-size: 13px;
          color: var(--text-muted);
        }
        .day-detail-tracked-card {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          text-align: left;
          cursor: pointer;
          color: var(--text);
        }
        .day-detail-tracked-info {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }
        .day-detail-tracked-focus {
          font-size: 15px;
          font-weight: 600;
        }
        .day-detail-tracked-sub {
          font-size: 12px;
          color: var(--text-muted);
        }
        .day-detail-badge {
          flex-shrink: 0;
          font-size: 12px;
          font-weight: 600;
          padding: var(--space-1) var(--space-3);
          border-radius: 999px;
          background: var(--surface-raised);
          border: 1px solid var(--border);
          color: var(--text-muted);
        }
        .day-detail-badge-done {
          color: var(--success);
          border-color: var(--success);
        }
        .day-detail-suggestion {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .day-detail-focus-btn {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          background: none;
          border: none;
          padding: 0;
          color: var(--text);
          cursor: pointer;
        }
        .day-detail-focus {
          font-size: 20px;
        }
        .day-detail-focus-edit {
          font-size: 12px;
          font-weight: 600;
          color: var(--accent);
        }
        .day-detail-swap {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }
        .day-detail-swap-chip {
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
        .day-detail-swap-chip-active {
          border-color: var(--accent);
          background: var(--accent-surface);
          color: var(--accent);
        }
        .day-detail-error {
          color: var(--danger);
          font-size: 13px;
        }
        .day-detail-note,
        .day-detail-empty {
          font-size: 14px;
          color: var(--text-muted);
        }
        .day-detail-actions {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .day-detail-btn {
          width: 100%;
        }
        .day-detail-log-else {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
