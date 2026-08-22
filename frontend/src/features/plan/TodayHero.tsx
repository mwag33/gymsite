// Today's focus card. Now driven by the merged DaySessionView (see
// mergeSessions.ts) instead of a single PlanDoc session, since a day can hold
// zero, one, or several tracked sessions plus an unaccepted suggestion.
// Quieter state for rest days per the plan's visual-polish guidance (recede,
// no status dot).
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import type { DaySessionView } from "./mergeSessions";
import { FOCUS_LABELS } from "./planFocus";
import { FocusBadge, FocusIcon } from "./focusIcons";

interface TodayHeroProps {
  today: DaySessionView;
}

function renderContent(today: DaySessionView, navigate: (path: string) => void): ReactNode {
  const { tracked, unacceptedSuggestion } = today;

  if (tracked.length === 0 && !unacceptedSuggestion) {
    return (
      <div className="today-hero card today-hero-empty">
        <p>No session scheduled for today yet.</p>
      </div>
    );
  }

  if (tracked.length === 0 && unacceptedSuggestion?.focus === "rest") {
    return (
      <div className="today-hero-rest">
        <FocusBadge session={unacceptedSuggestion} size={22} muted />
        <div>
          <span className="today-hero-rest-label">Rest day</span>
          {unacceptedSuggestion.note && <p className="today-hero-rest-note">{unacceptedSuggestion.note}</p>}
        </div>
      </div>
    );
  }

  if (tracked.length > 1) {
    return (
      <div className="today-hero-stack">
        {tracked.map((session) => (
          <button
            key={session.id}
            type="button"
            className="today-hero card today-hero-stacked-item"
            onClick={() => navigate(`/session/${session.id}`)}
          >
            <FocusIcon focus={session.focus} width={28} height={28} />
            <div className="today-hero-heading">
              <span className="today-hero-eyebrow">{session.status === "done" ? "Done" : "In progress"}</span>
              <h2 className="today-hero-focus">{FOCUS_LABELS[session.focus] ?? session.focus}</h2>
            </div>
          </button>
        ))}
      </div>
    );
  }

  if (tracked.length === 1) {
    const session = tracked[0];
    const exerciseNames = session.exercises.slice(0, 3).map((ex) => ex.name);
    return (
      <div className="today-hero card">
        <div className="today-hero-header">
          <FocusIcon focus={session.focus} width={36} height={36} />
          <div className="today-hero-heading">
            <span className="today-hero-eyebrow">
              Today · {session.status === "done" ? "Done" : "In progress"}
            </span>
            <h2 className="today-hero-focus">{FOCUS_LABELS[session.focus] ?? session.focus}</h2>
          </div>
        </div>
        <p className="today-hero-sub">
          {session.exercises.length === 0
            ? "No exercises yet."
            : `${session.exercises.length} exercise${session.exercises.length === 1 ? "" : "s"} · ${exerciseNames.join(", ")}${session.exercises.length > exerciseNames.length ? "…" : ""}`}
        </p>
        <button type="button" className="btn btn-primary today-hero-cta" onClick={() => navigate(`/session/${session.id}`)}>
          {session.status === "done" ? "Review session" : "Continue logging"}
        </button>
      </div>
    );
  }

  // tracked.length === 0 but there's a non-rest unaccepted suggestion.
  const suggestion = unacceptedSuggestion!;
  const exerciseNames = (suggestion.exercises ?? []).slice(0, 3).map((ex) => ex.name);
  return (
    <div className="today-hero card">
      <div className="today-hero-header">
        <FocusBadge session={suggestion} size={36} />
        <div className="today-hero-heading">
          <span className="today-hero-eyebrow">Today</span>
          <h2 className="today-hero-focus">{FOCUS_LABELS[suggestion.focus]}</h2>
        </div>
      </div>

      {suggestion.exercises === null ? (
        <p className="today-hero-sub">Exercises for this session haven't been generated yet.</p>
      ) : exerciseNames.length > 0 ? (
        <p className="today-hero-sub">
          {suggestion.exercises.length} exercise{suggestion.exercises.length === 1 ? "" : "s"} ·{" "}
          {exerciseNames.join(", ")}
          {(suggestion.exercises?.length ?? 0) > exerciseNames.length ? "…" : ""}
        </p>
      ) : (
        <p className="today-hero-sub">No exercises planned for today.</p>
      )}

      <button type="button" className="btn btn-primary today-hero-cta" onClick={() => navigate("/log")}>
        Start logging
      </button>
    </div>
  );
}

export default function TodayHero({ today }: TodayHeroProps) {
  const navigate = useNavigate();

  return (
    <>
      {renderContent(today, navigate)}

      <style>{`
        .today-hero {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          background: var(--accent-surface);
          border-color: var(--accent);
        }
        .today-hero-stack {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .today-hero-stacked-item {
          flex-direction: row;
          align-items: center;
          gap: var(--space-3);
          text-align: left;
          cursor: pointer;
        }
        .today-hero-header {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .today-hero-heading {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .today-hero-eyebrow {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }
        .today-hero-focus {
          font-size: 24px;
          font-weight: 700;
        }
        .today-hero-sub {
          font-size: 14px;
          color: var(--text-muted);
        }
        .today-hero-cta {
          width: 100%;
        }
        .today-hero-empty {
          color: var(--text-muted);
        }
        .today-hero-rest {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          opacity: 0.7;
        }
        .today-hero-rest-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
        }
        .today-hero-rest-note {
          font-size: 13px;
          color: var(--text-muted);
        }
      `}</style>
    </>
  );
}
