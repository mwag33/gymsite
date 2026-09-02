// Today's focus card. Now driven by the merged DaySessionView (see
// mergeSessions.ts) instead of a single PlanDoc session, since a day can hold
// zero, one, or several tracked sessions plus an unaccepted suggestion.
// Quieter state for rest days per the plan's visual-polish guidance (recede,
// no status dot).
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import type { DaySessionView } from "./mergeSessions";
import { FOCUS_LABELS } from "./planFocus";
import { FocusBadge } from "./focusIcons";
import { FOCUS_IMAGE } from "./focusImages";
import { FocusTags, FOCUS_TAGS_STYLES } from "./FocusTags";
import { deriveSessionFocusTags } from "./deriveFocus";

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
        {tracked.map((session) => {
          const tags = deriveSessionFocusTags(session);
          return (
            <button
              key={session.id}
              type="button"
              className="today-hero card today-hero-stacked-item"
              onClick={() => navigate(`/session/${session.id}`)}
            >
              <div className="today-hero-heading">
                <span className="today-hero-eyebrow">{session.status === "done" ? "Done" : "In progress"}</span>
                <FocusTags categories={tags.categories} iconSize={22} />
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  if (tracked.length === 1) {
    const session = tracked[0];
    const tags = deriveSessionFocusTags(session);
    const exerciseNames = session.exercises.slice(0, 3).map((ex) => ex.name);
    // "Actual overrides planned": the photo matches what was actually logged
    // (primary derived category), not the session's frozen creation-time
    // focus - falls back to that frozen focus only while nothing's logged yet,
    // and shows no photo at all for a still-empty ad hoc session.
    const image = tags.categories.length > 0 ? FOCUS_IMAGE[tags.categories[0]] : FOCUS_IMAGE[session.focus];
    return (
      <div className="today-hero card">
        {image && <img src={image} alt="" className="today-hero-image" />}
        <div className="today-hero-header">
          <div className="today-hero-heading">
            <span className="today-hero-eyebrow">
              Today · {session.status === "done" ? "Done" : "In progress"}
            </span>
            <FocusTags categories={tags.categories} muscles={tags.muscles} iconSize={28} />
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
  const suggestionImage = FOCUS_IMAGE[suggestion.focus];
  return (
    <div className="today-hero card">
      {suggestionImage && <img src={suggestionImage} alt="" className="today-hero-image" />}
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
        ${FOCUS_TAGS_STYLES}
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
        .today-hero-image {
          display: block;
          width: calc(100% + var(--space-4) * 2);
          height: 120px;
          object-fit: cover;
          margin: calc(var(--space-4) * -1) calc(var(--space-4) * -1) var(--space-3);
          border-radius: var(--radius-lg) var(--radius-lg) 0 0;
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
        .today-hero-heading .focus-tags-item {
          font-size: 22px;
          font-weight: 700;
        }
        .today-hero-stacked-item .focus-tags-item {
          font-size: 17px;
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
