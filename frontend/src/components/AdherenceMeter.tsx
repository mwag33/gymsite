// Shared adherence figure + progress meter, extracted from
// pages/progress/OverviewStats.tsx so the Progress tab and the Home tab's
// compact chip use one visual idiom instead of two near-duplicate meters.
interface AdherenceMeterProps {
  /** Sessions completed so far in the period (e.g. this week). */
  completed: number;
  /** Target session count for the period, or null if there's no plan yet. */
  target: number | null;
  /** Compact renders a single-line chip; the default is the full card body. */
  compact?: boolean;
}

export default function AdherenceMeter({ completed, target, compact = false }: AdherenceMeterProps) {
  const ratio = target ? Math.min(1, completed / target) : 0;

  if (compact) {
    return (
      <div className="adherence-meter adherence-meter-compact">
        <span className="adherence-meter-compact-figure tnum">
          {target ? `${completed}/${target}` : completed}
        </span>
        <div
          className="adherence-meter-track adherence-meter-track-compact"
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={target ?? completed}
        >
          <div className="adherence-meter-fill" style={{ width: `${ratio * 100}%` }} />
        </div>

        <style>{`
          .adherence-meter-compact {
            display: flex;
            align-items: center;
            gap: var(--space-2);
          }
          .adherence-meter-compact-figure {
            font-size: 13px;
            font-weight: 700;
            flex-shrink: 0;
          }
          .adherence-meter-track-compact {
            flex: 1;
            height: 6px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="adherence-meter">
      {target ? (
        <>
          <div className="adherence-meter-figure tnum">
            {completed} <span>of {target} sessions</span>
          </div>
          <div
            className="adherence-meter-track"
            role="progressbar"
            aria-valuenow={completed}
            aria-valuemin={0}
            aria-valuemax={target}
          >
            <div className="adherence-meter-fill" style={{ width: `${ratio * 100}%` }} />
          </div>
        </>
      ) : (
        <div className="adherence-meter-figure tnum">
          {completed} <span>session{completed === 1 ? "" : "s"} logged</span>
        </div>
      )}

      <style>{`
        .adherence-meter {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .adherence-meter-figure {
          font-size: 24px;
          font-weight: 700;
        }
        .adherence-meter-figure span {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-muted);
        }
        .adherence-meter-track {
          height: 8px;
          border-radius: 4px;
          background: var(--surface-raised);
          border: 1px solid var(--border);
          overflow: hidden;
        }
        .adherence-meter-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 4px;
          transition: width 0.2s ease;
        }
      `}</style>
    </div>
  );
}
