import { useState } from "react";
import MachineTrends from "./MachineTrends";
import OverviewStats from "./OverviewStats";

type ProgressTab = "machine" | "overview";

export default function ProgressPage() {
  const [tab, setTab] = useState<ProgressTab>("overview");

  return (
    <div className="progress-page">
      <div className="progress-page-tabs" role="tablist" aria-label="Progress view">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "overview"}
          className={"progress-page-tab" + (tab === "overview" ? " progress-page-tab-active" : "")}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "machine"}
          className={"progress-page-tab" + (tab === "machine" ? " progress-page-tab-active" : "")}
          onClick={() => setTab("machine")}
        >
          By machine
        </button>
      </div>

      {tab === "overview" ? <OverviewStats /> : <MachineTrends />}

      <style>{`
        .progress-page {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .progress-page-tabs {
          display: flex;
          gap: var(--space-2);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 4px;
        }
        .progress-page-tab {
          flex: 1;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          padding: var(--space-2) var(--space-3);
          font-size: 14px;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
        }
        .progress-page-tab-active {
          background: var(--accent);
          color: var(--accent-text);
        }
      `}</style>
    </div>
  );
}
