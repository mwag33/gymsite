import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveGym } from "../../contexts/ActiveGymContext";
import { updateUserSettings, recalculatePlan } from "../../lib/callables";
import type { AiRateLimitError } from "../../lib/callables";
import type { WorkoutMode } from "../../lib/types";
import { SimpleLogView } from "./SimpleLogView";
import { DetailedLogView } from "./DetailedLogView";

type PostLogPhase = "recalculating" | "done" | "error";

interface PostLogStatus {
  phase: PostLogPhase;
  logId: string;
  message?: string;
  isRateLimit?: boolean;
}

export default function LogWorkoutPage() {
  const { user, profile } = useAuth();
  const { activeGym } = useActiveGym();

  const [mode, setMode] = useState<WorkoutMode>("simple");
  const modeInitialized = useRef(false);

  // Default the toggle to the user's saved preference the first time the
  // profile becomes available; afterwards the toggle is fully user-driven.
  useEffect(() => {
    if (!modeInitialized.current && profile) {
      setMode(profile.settings.logModeDefault ?? "simple");
      modeInitialized.current = true;
    }
  }, [profile]);

  const [status, setStatus] = useState<PostLogStatus | null>(null);

  function handleModeChange(next: WorkoutMode) {
    setMode(next);
    modeInitialized.current = true;
    void updateUserSettings({ logModeDefault: next }).catch(() => {
      // Persisting the default is a convenience, not a blocking action — the
      // toggle already reflects the user's choice locally either way.
    });
  }

  async function runRecalculation(logId: string) {
    setStatus({ phase: "recalculating", logId });
    try {
      await recalculatePlan(logId);
      setStatus({ phase: "done", logId });
    } catch (err) {
      const isRateLimit = (err as Partial<AiRateLimitError> | undefined)?.isRateLimit === true;
      const message =
        err instanceof Error ? err.message : "Couldn't update your plan. Please try again later.";
      setStatus({ phase: "error", logId, message, isRateLimit });
    }
  }

  // The workout log write and the plan recalculation are two independent
  // steps — this is only ever called after the log doc already exists, so a
  // recalculation failure can never make the log itself look unsaved.
  function handleWorkoutLogged(logId: string) {
    void runRecalculation(logId);
  }

  if (!user) return null;

  return (
    <div className="log-page">
      <div className="log-mode-toggle" role="tablist" aria-label="Logging mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "simple"}
          className={"log-mode-btn" + (mode === "simple" ? " log-mode-btn-active" : "")}
          onClick={() => handleModeChange("simple")}
        >
          Simple
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "detailed"}
          className={"log-mode-btn" + (mode === "detailed" ? " log-mode-btn-active" : "")}
          onClick={() => handleModeChange("detailed")}
        >
          Detailed
        </button>
      </div>

      {status && (
        <div className="card log-status-card" role="status">
          <p className="log-status-line">Workout logged</p>
          {status.phase === "recalculating" && (
            <p className="log-status-sub log-status-muted">
              <span className="log-spinner" aria-hidden /> Updating your plan for the next 7
              days...
            </p>
          )}
          {status.phase === "done" && (
            <p className="log-status-sub log-status-success">Plan updated.</p>
          )}
          {status.phase === "error" && (
            <div className="log-status-sub log-status-error">
              <p>{status.message}</p>
              <button
                type="button"
                className="btn btn-secondary log-retry-btn"
                onClick={() => void runRecalculation(status.logId)}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {mode === "simple" ? (
        <SimpleLogView
          uid={user.uid}
          gymId={activeGym?.id ?? null}
          onLogged={handleWorkoutLogged}
        />
      ) : (
        <DetailedLogView uid={user.uid} activeGym={activeGym} onLogged={handleWorkoutLogged} />
      )}

      <style>{`
        .log-page {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .log-mode-toggle {
          display: flex;
          gap: var(--space-2);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-1);
        }
        .log-mode-btn {
          flex: 1;
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-sm);
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .log-mode-btn-active {
          background: var(--surface-raised);
          color: var(--text);
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
        .log-status-sub {
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .log-status-muted {
          color: var(--text-muted);
        }
        .log-status-success {
          color: var(--success);
        }
        .log-status-error {
          color: var(--danger);
          flex-direction: column;
          align-items: flex-start;
        }
        .log-retry-btn {
          padding: var(--space-1) var(--space-3);
          font-size: 13px;
        }
        .log-spinner {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid var(--border);
          border-top-color: var(--accent);
          animation: log-spin 0.8s linear infinite;
          flex-shrink: 0;
        }
        @keyframes log-spin {
          to {
            transform: rotate(360deg);
          }
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
        .log-note-label {
          font-size: 13px;
          color: var(--text-muted);
        }
        .log-note-input {
          resize: vertical;
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text);
          padding: var(--space-2) var(--space-3);
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
