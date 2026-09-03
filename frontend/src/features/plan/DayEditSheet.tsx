// Inline day editor opened by tapping a calendar cell (WeekAgenda/MonthAgenda)
// - the direct replacement for the old "navigate to /day, tap Change, pick a
// chip" flow. Everything here is a plain client Firestore write via
// dayActions.ts; there's no accept-gating and no separate page to visit just
// to change a day's type or move it.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet from "../../components/Sheet";
import type { DaySession, TrainingPlanFocus } from "../../lib/types";
import { weekdayLabel, shortDateLabel } from "./planDate";
import { EDITABLE_FOCUS_OPTIONS, FOCUS_LABELS } from "./planFocus";
import { FocusIcon } from "./focusIcons";
import { moveDaySession, setDayFocus } from "../tracking/dayActions";

interface DayEditSheetProps {
  open: boolean;
  onClose: () => void;
  uid: string;
  date: string;
  effectiveFocus: TrainingPlanFocus;
  session: DaySession | undefined;
  gymId: string | null;
}

export default function DayEditSheet({
  open,
  onClose,
  uid,
  date,
  effectiveFocus,
  session,
  gymId,
}: DayEditSheetProps) {
  const navigate = useNavigate();
  const [savingFocus, setSavingFocus] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePickFocus(focus: TrainingPlanFocus) {
    if (focus === effectiveFocus || savingFocus) return;
    setSavingFocus(true);
    setError(null);
    try {
      await setDayFocus(uid, date, focus, gymId, Boolean(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change this day's type.");
    } finally {
      setSavingFocus(false);
    }
  }

  async function handleMove() {
    if (!moveTarget || moveTarget === date || moving) return;
    setMoving(true);
    setError(null);
    try {
      await moveDaySession(uid, date, moveTarget);
      setMoveOpen(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't move this day.");
    } finally {
      setMoving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="day-edit-sheet">
        <div className="day-edit-header">
          <FocusIcon focus={effectiveFocus} width={22} height={22} />
          <div>
            <p className="day-edit-date">
              {weekdayLabel(date)} · {shortDateLabel(date)}
            </p>
            <h2 className="day-edit-focus">{FOCUS_LABELS[effectiveFocus]}</h2>
          </div>
        </div>

        <div className="day-edit-chips" role="list">
          {EDITABLE_FOCUS_OPTIONS.map((focus) => (
            <button
              key={focus}
              type="button"
              role="listitem"
              className={"day-edit-chip" + (focus === effectiveFocus ? " day-edit-chip-active" : "")}
              disabled={savingFocus}
              onClick={() => void handlePickFocus(focus)}
            >
              <FocusIcon focus={focus} width={14} height={14} />
              {FOCUS_LABELS[focus]}
            </button>
          ))}
        </div>

        {moveOpen ? (
          <div className="day-edit-move">
            <input
              type="date"
              className="day-edit-move-input"
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!moveTarget || moving}
              onClick={() => void handleMove()}
            >
              {moving ? "Moving…" : "Move"}
            </button>
          </div>
        ) : null}

        {error && <p className="day-edit-error">{error}</p>}

        <div className="day-edit-actions">
          <button
            type="button"
            className="btn btn-primary day-edit-btn"
            onClick={() => navigate(`/day/${date}`)}
          >
            Log workout
          </button>
          <button
            type="button"
            className="btn btn-secondary day-edit-btn"
            onClick={() => setMoveOpen((v) => !v)}
          >
            {moveOpen ? "Cancel move" : "Move to another day"}
          </button>
        </div>
      </div>

      <style>{`
        .day-edit-sheet {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .day-edit-header {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .day-edit-date {
          margin: 0;
          font-size: 12px;
          color: var(--text-muted);
        }
        .day-edit-focus {
          margin: 0;
          font-size: 20px;
        }
        .day-edit-chips {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }
        .day-edit-chip {
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
        .day-edit-chip-active {
          border-color: var(--accent);
          background: var(--accent-surface);
          color: var(--accent);
        }
        .day-edit-move {
          display: flex;
          gap: var(--space-2);
        }
        .day-edit-move-input {
          flex: 1;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-2) var(--space-3);
          color: var(--text);
        }
        .day-edit-error {
          color: var(--danger);
          font-size: 13px;
        }
        .day-edit-actions {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .day-edit-btn {
          width: 100%;
        }
      `}</style>
    </Sheet>
  );
}
