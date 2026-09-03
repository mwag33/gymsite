// Today's focus card. Driven by today's DayView (see daySessionsRange.ts)
// plus its DaySession doc, if one exists yet - a day with no doc shows its
// weeklyFocusPattern default as an unconfirmed suggestion. Quieter state for
// rest days per the plan's visual-polish guidance (recede, no status dot).
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import type { DaySession } from "../../lib/types";
import type { DayView } from "./daySessionsRange";
import { FOCUS_LABELS } from "./planFocus";
import { FocusIcon } from "./focusIcons";
import { FOCUS_IMAGE } from "./focusImages";
import { FocusTags, FOCUS_TAGS_STYLES } from "./FocusTags";
import { deriveSessionFocusTags } from "./deriveFocus";
import { computeDaySessionStatus } from "../tracking/dayActions";

interface TodayHeroProps {
  date: string;
  view: DayView;
  session: DaySession | undefined;
}

function renderContent(date: string, view: DayView, session: DaySession | undefined, navigate: (path: string) => void): ReactNode {
  if (!session) {
    if (view.focus === "rest") {
      return (
        <div className="today-hero-rest">
          <FocusIcon focus="rest" width={22} height={22} />
          <span className="today-hero-rest-label">Rest day</span>
        </div>
      );
    }
    const suggestionImage = FOCUS_IMAGE[view.focus];
    return (
      <div className="today-hero card">
        {suggestionImage && <img src={suggestionImage} alt="" className="today-hero-image" />}
        <div className="today-hero-header">
          <FocusIcon focus={view.focus} width={28} height={28} />
          <div className="today-hero-heading">
            <span className="today-hero-eyebrow">Today</span>
            <h2 className="today-hero-focus">{FOCUS_LABELS[view.focus]}</h2>
          </div>
        </div>
        <p className="today-hero-sub">Nothing logged yet.</p>
        <button type="button" className="btn btn-primary today-hero-cta" onClick={() => navigate(`/day/${date}`)}>
          Start logging
        </button>
      </div>
    );
  }

  const tags = deriveSessionFocusTags(session);
  const status = computeDaySessionStatus(session.exercises);
  const exerciseNames = session.exercises.slice(0, 3).map((ex) => ex.name);
  // "Actual overrides planned": the photo matches what was actually logged
  // (primary derived category), not the day's assigned focus - falls back to
  // that focus only while nothing's logged yet.
  const image = tags.categories.length > 0 ? FOCUS_IMAGE[tags.categories[0]] : FOCUS_IMAGE[session.focus];
  return (
    <div className="today-hero card">
      {image && <img src={image} alt="" className="today-hero-image" />}
      <div className="today-hero-header">
        <div className="today-hero-heading">
          <span className="today-hero-eyebrow">Today · {status === "done" ? "Done" : "In progress"}</span>
          <FocusTags categories={tags.categories} muscles={tags.muscles} iconSize={28} />
        </div>
      </div>
      <p className="today-hero-sub">
        {session.exercises.length === 0
          ? "No exercises yet."
          : `${session.exercises.length} exercise${session.exercises.length === 1 ? "" : "s"} · ${exerciseNames.join(", ")}${session.exercises.length > exerciseNames.length ? "…" : ""}`}
      </p>
      <button type="button" className="btn btn-primary today-hero-cta" onClick={() => navigate(`/day/${date}`)}>
        {status === "done" ? "Review session" : "Continue logging"}
      </button>
    </div>
  );
}

export default function TodayHero({ date, view, session }: TodayHeroProps) {
  const navigate = useNavigate();

  return (
    <>
      {renderContent(date, view, session, navigate)}

      <style>{`
        ${FOCUS_TAGS_STYLES}
        .today-hero {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          background: var(--accent-surface);
          border-color: var(--accent);
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
        .today-hero-sub {
          font-size: 14px;
          color: var(--text-muted);
        }
        .today-hero-cta {
          width: 100%;
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
      `}</style>
    </>
  );
}
