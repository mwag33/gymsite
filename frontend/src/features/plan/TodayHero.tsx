// Today's focus card: exercise-name preview, "Start logging" CTA, and an
// inline AdjustmentBanner if today's session was rescheduled. Quieter state
// for rest days per the plan's visual-polish guidance (recede, no status dot).
import { useNavigate } from "react-router-dom";
import type { Session } from "../../lib/types";
import { FOCUS_LABELS } from "./planFocus";
import AdjustmentBanner from "./AdjustmentBanner";

interface TodayHeroProps {
  session: Session | null;
}

export default function TodayHero({ session }: TodayHeroProps) {
  const navigate = useNavigate();

  if (!session) {
    return (
      <div className="today-hero card today-hero-empty">
        <p>No session scheduled for today yet.</p>
      </div>
    );
  }

  const isRest = session.focus === "rest";
  const exerciseNames = (session.exercises ?? []).slice(0, 3).map((ex) => ex.name);

  if (isRest) {
    return (
      <div className="today-hero-rest">
        <span className="today-hero-rest-label">Rest day</span>
        {session.note && <p className="today-hero-rest-note">{session.note}</p>}
      </div>
    );
  }

  return (
    <div className="today-hero card">
      <AdjustmentBanner session={session} />
      <div className="today-hero-header">
        <span className="today-hero-eyebrow">Today</span>
        <h2 className="today-hero-focus">{FOCUS_LABELS[session.focus]}</h2>
      </div>

      {session.exercises === null ? (
        <p className="today-hero-sub">Exercises for this session haven't been generated yet.</p>
      ) : exerciseNames.length > 0 ? (
        <p className="today-hero-sub">
          {exerciseNames.join(", ")}
          {(session.exercises?.length ?? 0) > exerciseNames.length ? "…" : ""}
        </p>
      ) : (
        <p className="today-hero-sub">No exercises planned for today.</p>
      )}

      <button
        type="button"
        className="btn btn-primary today-hero-cta"
        onClick={() => navigate("/log")}
      >
        Start logging
      </button>

      <style>{`
        .today-hero {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          background: var(--accent-surface);
          border-color: var(--accent);
        }
        .today-hero-header {
          display: flex;
          flex-direction: column;
          gap: 2px;
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
          flex-direction: column;
          gap: 2px;
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
    </div>
  );
}
