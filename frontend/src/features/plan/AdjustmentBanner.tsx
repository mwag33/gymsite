// Surfaces a rescheduled session's reason verbatim — never synthesizes copy
// itself. The deterministic rebalance engine (functions/src/planEngine.ts)
// stamps `rescheduledFromSessionId` and writes its reasoning into `note`;
// this component only renders what the backend wrote, or nothing at all if
// there's no text to show.
import type { Session } from "../../lib/types";

interface AdjustmentBannerProps {
  session: Session;
}

export default function AdjustmentBanner({ session }: AdjustmentBannerProps) {
  const isAdjusted = session.source === "deterministic_reschedule" || Boolean(session.rescheduledFromSessionId);
  const reason = session.note?.trim();
  if (!isAdjusted || !reason) return null;

  return (
    <div className="adjustment-banner" role="status">
      <span className="adjustment-banner-dot" aria-hidden />
      <span className="adjustment-banner-text">{reason}</span>

      <style>{`
        .adjustment-banner {
          display: flex;
          align-items: flex-start;
          gap: var(--space-2);
          background: var(--accent-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-2) var(--space-3);
          font-size: 13px;
        }
        .adjustment-banner-dot {
          width: 8px;
          height: 8px;
          margin-top: 5px;
          border-radius: 50%;
          background: var(--accent);
          flex-shrink: 0;
        }
        .adjustment-banner-text {
          color: var(--text);
        }
      `}</style>
    </div>
  );
}
