import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import type {
  Machine,
  MachineCategory,
  MachineStats,
  MachineStatsHistoryEntry,
  SetEntry,
} from "../../lib/types";
import { formatShortDate, formatSessionDate, toDate } from "./progressUtils";

type MachineStatsWithId = MachineStats & { id: string };
type MachineInfo = { name: string; category: MachineCategory };
type RangeKey = "4w" | "3m" | "all";

const RANGE_OPTIONS: { value: RangeKey; label: string; days: number | null }[] = [
  { value: "4w", label: "4 weeks", days: 28 },
  { value: "3m", label: "3 months", days: 92 },
  { value: "all", label: "All time", days: null },
];

interface ChartPoint {
  id: string;
  timestamp: number;
  dateLabel: string;
  weight: number;
  summary: string;
}

function topSet(sets: SetEntry[]): SetEntry | null {
  if (sets.length === 0) return null;
  return sets.reduce((best, s) => (s.weightKg > best.weightKg ? s : best), sets[0]);
}

function sessionSummary(sets: SetEntry[]): string {
  const best = topSet(sets);
  if (!best) return "No sets logged";
  const setCount = `${sets.length} set${sets.length === 1 ? "" : "s"}`;
  return `${setCount} · top ${best.weightKg}kg × ${best.reps}`;
}

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const point = payload?.[0]?.payload as ChartPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="machine-trends-tooltip">
      <div className="machine-trends-tooltip-date">{point.dateLabel}</div>
      <div className="machine-trends-tooltip-weight tnum">{point.weight} kg</div>
      <div className="machine-trends-tooltip-summary tnum">{point.summary}</div>
    </div>
  );
}

export default function MachineTrends() {
  const { user } = useAuth();
  const [statsList, setStatsList] = useState<MachineStatsWithId[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [machineInfo, setMachineInfo] = useState<Record<string, MachineInfo>>({});
  const [history, setHistory] = useState<MachineStatsHistoryEntry[] | null>(null);
  const [range, setRange] = useState<RangeKey>("3m");
  const requestedInfo = useRef<Set<string>>(new Set());

  // List every machine the user has stats for (each doc id is a machineId).
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "users", user.uid, "machineStats"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as MachineStats) }));
      list.sort((a, b) => (toDate(b.lastUsedAt)?.getTime() ?? 0) - (toDate(a.lastUsedAt)?.getTime() ?? 0));
      setStatsList(list);
      setSelectedId((current) => (current && list.some((s) => s.id === current) ? current : list[0]?.id ?? null));
    });
  }, [user]);

  // Fetch display name + category per machine, lazily, from
  // gyms/{gymId}/machines/{machineId} — not denormalized onto machineStats.
  useEffect(() => {
    if (!statsList) return;
    const toFetch = statsList.filter((s) => !requestedInfo.current.has(s.id));
    if (toFetch.length === 0) return;
    for (const stats of toFetch) requestedInfo.current.add(stats.id);
    void Promise.all(
      toFetch.map(async (stats) => {
        const snap = await getDoc(doc(db, "gyms", stats.gymId, "machines", stats.id));
        if (!snap.exists()) return null;
        const machine = snap.data() as Machine;
        return { id: stats.id, name: machine.name, category: machine.category };
      })
    ).then((results) => {
      setMachineInfo((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r) next[r.id] = { name: r.name, category: r.category };
        }
        return next;
      });
    });
  }, [statsList]);

  // Subscribe to the selected machine's session history.
  useEffect(() => {
    if (!user || !selectedId) {
      setHistory(null);
      return;
    }
    setHistory(null);
    const historyQuery = query(
      collection(db, "users", user.uid, "machineStats", selectedId, "history"),
      orderBy("date", "asc")
    );
    return onSnapshot(historyQuery, (snap) => {
      setHistory(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MachineStatsHistoryEntry, "id">) }))
      );
    });
  }, [user, selectedId]);

  const cutoff = useMemo(() => {
    const option = RANGE_OPTIONS.find((o) => o.value === range);
    if (!option?.days) return null;
    const d = new Date();
    d.setDate(d.getDate() - option.days);
    return d;
  }, [range]);

  const filteredHistory = useMemo(() => {
    if (!history) return [];
    if (!cutoff) return history;
    return history.filter((entry) => {
      const d = toDate(entry.date);
      return d ? d >= cutoff : false;
    });
  }, [history, cutoff]);

  const chartData: ChartPoint[] = useMemo(
    () =>
      filteredHistory
        .map((entry) => {
          const date = toDate(entry.date);
          return {
            id: entry.id,
            timestamp: date ? date.getTime() : 0,
            dateLabel: date ? formatShortDate(date) : "",
            weight: topSet(entry.sets)?.weightKg ?? 0,
            summary: sessionSummary(entry.sets),
          };
        })
        .sort((a, b) => a.timestamp - b.timestamp),
    [filteredHistory]
  );

  const sessionsDescending = useMemo(() => [...filteredHistory].reverse(), [filteredHistory]);

  if (statsList === null) {
    return <div className="card">Loading machine history...</div>;
  }

  if (statsList.length === 0) {
    return (
      <div className="card progress-empty">
        <p>No machine history yet.</p>
        <p className="progress-empty-sub">Log your first workout to see progress here.</p>
      </div>
    );
  }

  const selectedStats = statsList.find((s) => s.id === selectedId) ?? null;
  const selectedInfo = selectedId ? machineInfo[selectedId] : undefined;

  return (
    <div className="machine-trends">
      <label className="machine-trends-picker">
        <span className="visually-hidden">Choose a machine</span>
        <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)}>
          {statsList.map((s) => (
            <option key={s.id} value={s.id}>
              {machineInfo[s.id]?.name ?? "Loading..."}
            </option>
          ))}
        </select>
      </label>

      {selectedStats && (
        <div className="card machine-trends-pb">
          <span className="machine-trends-pb-label">Personal best{selectedInfo ? ` · ${selectedInfo.name}` : ""}</span>
          <span className="machine-trends-pb-value tnum">{selectedStats.bestWeightKg} kg</span>
          <span className="machine-trends-pb-sub tnum">{selectedStats.totalSessions} sessions logged</span>
        </div>
      )}

      <div className="machine-trends-range" role="group" aria-label="Date range">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={"machine-trends-range-btn" + (range === opt.value ? " machine-trends-range-btn-active" : "")}
            onClick={() => setRange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="card machine-trends-chart">
        {chartData.length === 0 ? (
          <p className="progress-empty-sub">No sessions in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                stroke="var(--text-muted)"
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                minTickGap={24}
              />
              <YAxis
                stroke="var(--text-muted)"
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={40}
                unit="kg"
              />
              <Tooltip content={ChartTooltip} cursor={{ stroke: "var(--border)" }} />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={{ r: 4, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
                activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="machine-trends-sessions">
        <h3>Past sessions</h3>
        {sessionsDescending.length === 0 ? (
          <p className="progress-empty-sub">No sessions in this range.</p>
        ) : (
          <ul className="machine-trends-session-list">
            {sessionsDescending.map((entry) => {
              const date = toDate(entry.date);
              return (
                <li key={entry.id} className="card machine-trends-session">
                  <span className="machine-trends-session-date">
                    {date ? formatSessionDate(date) : "Unknown date"}
                  </span>
                  <span className="machine-trends-session-sets tnum">
                    {entry.sets.map((s) => `${s.weightKg}kg × ${s.reps}`).join(", ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <style>{`
        .machine-trends {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .machine-trends-picker select {
          width: 100%;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          color: var(--text);
        }
        .machine-trends-pb {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .machine-trends-pb-label {
          font-size: 13px;
          color: var(--text-muted);
        }
        .machine-trends-pb-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--accent);
        }
        .machine-trends-pb-sub {
          font-size: 13px;
          color: var(--text-muted);
        }
        .machine-trends-range {
          display: flex;
          gap: var(--space-2);
        }
        .machine-trends-range-btn {
          flex: 1;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: var(--space-2) var(--space-3);
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
        }
        .machine-trends-range-btn-active {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--accent-text);
        }
        .machine-trends-chart {
          padding: var(--space-3) var(--space-2) var(--space-2);
        }
        .machine-trends-tooltip {
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: var(--space-2) var(--space-3);
          font-size: 12px;
        }
        .machine-trends-tooltip-date {
          color: var(--text-muted);
          margin-bottom: 2px;
        }
        .machine-trends-tooltip-weight {
          font-weight: 700;
          font-size: 15px;
        }
        .machine-trends-tooltip-summary {
          color: var(--text-muted);
        }
        .machine-trends-sessions h3 {
          font-size: 15px;
          margin-bottom: var(--space-3);
        }
        .machine-trends-session-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .machine-trends-session {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          padding: var(--space-3);
        }
        .machine-trends-session-date {
          font-size: 13px;
          color: var(--text-muted);
        }
        .machine-trends-session-sets {
          font-size: 14px;
          font-weight: 600;
          text-align: right;
        }
        .progress-empty-sub {
          color: var(--text-muted);
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
