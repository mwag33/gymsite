import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import type { Machine, MachineCategory, PlanDoc, WorkoutLog } from "../../lib/types";
import { MACHINE_CATEGORIES } from "../../lib/types";
import AdherenceMeter from "../../components/AdherenceMeter";
import { addDays, computeStreak, startOfWeek, toDate } from "./progressUtils";

// Bound how far back we scan workoutLogs for the category breakdown — recent
// training pattern, not a full-history analytics engine.
const LOOKBACK_WEEKS = 8;

interface CategoryPoint {
  category: string;
  count: number;
}

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const point = payload?.[0]?.payload as CategoryPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="overview-tooltip">
      <div className="overview-tooltip-category">{point.category}</div>
      <div className="overview-tooltip-count tnum">
        {point.count} exercise{point.count === 1 ? "" : "s"}
      </div>
    </div>
  );
}

export default function OverviewStats() {
  const { user, profile } = useAuth();
  const [plan, setPlan] = useState<PlanDoc | null | undefined>(undefined);
  const [logs, setLogs] = useState<WorkoutLog[] | null>(null);
  const [categoryCache, setCategoryCache] = useState<Record<string, MachineCategory>>({});
  const requestedCategories = useRef<Set<string>>(new Set());

  const weekStartsOn = profile?.settings?.weekStartsOn ?? 1;

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid, "plans", "current"), (snap) => {
      setPlan(snap.exists() ? (snap.data() as PlanDoc) : null);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const cutoff = addDays(new Date(), -LOOKBACK_WEEKS * 7);
    const logsQuery = query(
      collection(db, "users", user.uid, "workoutLogs"),
      where("date", ">=", cutoff),
      orderBy("date", "asc")
    );
    return onSnapshot(logsQuery, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkoutLog, "id">) })));
    });
  }, [user]);

  // For detailed-mode logs, resolve each referenced machine's category (small
  // in-memory cache keyed by gymId/machineId to avoid duplicate reads).
  useEffect(() => {
    if (!logs) return;
    const toFetch = new Map<string, { gymId: string; machineId: string }>();
    for (const log of logs) {
      if (log.mode !== "detailed" || !log.exercises) continue;
      for (const exercise of log.exercises) {
        const key = `${exercise.gymId}/${exercise.machineId}`;
        if (!requestedCategories.current.has(key)) {
          toFetch.set(key, { gymId: exercise.gymId, machineId: exercise.machineId });
        }
      }
    }
    if (toFetch.size === 0) return;
    for (const key of toFetch.keys()) requestedCategories.current.add(key);
    void Promise.all(
      Array.from(toFetch.entries()).map(async ([key, ref]) => {
        try {
          const snap = await getDoc(doc(db, "gyms", ref.gymId, "machines", ref.machineId));
          const category = snap.exists() ? (snap.data() as Machine).category : "other";
          return [key, category] as const;
        } catch {
          return [key, "other"] as const;
        }
      })
    ).then((results) => {
      setCategoryCache((prev) => {
        const next = { ...prev };
        for (const [key, category] of results) next[key] = category;
        return next;
      });
    });
  }, [logs]);

  const thisWeekStart = useMemo(() => startOfWeek(new Date(), weekStartsOn), [weekStartsOn]);
  const trailing4WeekStart = useMemo(() => addDays(thisWeekStart, -21), [thisWeekStart]);

  const sessionsThisWeek = useMemo(() => {
    if (!logs) return 0;
    return logs.filter((log) => {
      const d = toDate(log.date);
      return d ? d >= thisWeekStart : false;
    }).length;
  }, [logs, thisWeekStart]);

  const sessionsTrailing4Weeks = useMemo(() => {
    if (!logs) return 0;
    return logs.filter((log) => {
      const d = toDate(log.date);
      return d ? d >= trailing4WeekStart : false;
    }).length;
  }, [logs, trailing4WeekStart]);

  const frequencyPerWeek = plan?.frequencyPerWeek ?? null;
  const weekTarget = frequencyPerWeek ?? null;
  const fourWeekTarget = frequencyPerWeek ? frequencyPerWeek * 4 : null;
  const fourWeekAdherencePct = fourWeekTarget
    ? Math.round((sessionsTrailing4Weeks / fourWeekTarget) * 100)
    : null;

  const streak = useMemo(() => computeStreak(plan?.sessions ?? []), [plan]);

  const categoryData: CategoryPoint[] = useMemo(() => {
    const counts: Record<MachineCategory, number> = {
      chest: 0,
      back: 0,
      legs: 0,
      core: 0,
      cardio: 0,
      upper_body: 0,
      other: 0,
    };
    if (logs) {
      for (const log of logs) {
        if (log.mode === "simple" && log.bodyParts) {
          for (const part of log.bodyParts) counts[part] += 1;
        } else if (log.mode === "detailed" && log.exercises) {
          for (const exercise of log.exercises) {
            const key = `${exercise.gymId}/${exercise.machineId}`;
            const category = categoryCache[key] ?? "other";
            counts[category] += 1;
          }
        }
      }
    }
    const points = MACHINE_CATEGORIES.map((c) => ({ category: c.label, count: counts[c.value] }));
    if (counts.other > 0) points.push({ category: "Other", count: counts.other });
    return points;
  }, [logs, categoryCache]);

  const hasAnyLogs = (logs?.length ?? 0) > 0;
  const totalCategoryCount = categoryData.reduce((sum, p) => sum + p.count, 0);

  if (logs === null || plan === undefined) {
    return <div className="card">Loading progress...</div>;
  }

  return (
    <div className="overview-stats">
      <div className="card overview-adherence">
        <h3>This week</h3>
        <AdherenceMeter completed={sessionsThisWeek} target={weekTarget} />
        {!hasAnyLogs && (
          <p className="progress-empty-sub">Log your first workout to see progress here.</p>
        )}
        {fourWeekAdherencePct !== null && (
          <p className="overview-adherence-sub tnum">
            Last 4 weeks: {sessionsTrailing4Weeks} of {fourWeekTarget} sessions ({fourWeekAdherencePct}% adherence)
          </p>
        )}
        {plan === null && (
          <p className="overview-adherence-sub">No active plan yet — adherence targets will appear once one is generated.</p>
        )}
      </div>

      <div className="card overview-streak">
        <h3>Streak</h3>
        <div className="overview-streak-figures">
          <div className="overview-streak-figure">
            <span className="overview-streak-value tnum">{streak.current}</span>
            <span className="overview-streak-label">Current</span>
          </div>
          <div className="overview-streak-figure">
            <span className="overview-streak-value tnum">{streak.best}</span>
            <span className="overview-streak-label">Best</span>
          </div>
        </div>
      </div>

      <div className="card overview-categories">
        <h3>Training focus (last {LOOKBACK_WEEKS} weeks)</h3>
        {totalCategoryCount === 0 ? (
          <p className="progress-empty-sub">No workouts logged yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categoryData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="var(--border)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} stroke="var(--text-muted)" tick={{ fill: "var(--text-muted)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
              <YAxis
                type="category"
                dataKey="category"
                stroke="var(--text-muted)"
                tick={{ fill: "var(--text-muted)", fontSize: 13 }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip content={ChartTooltip} cursor={{ fill: "var(--surface-raised)" }} />
              <Bar dataKey="count" fill="var(--accent)" radius={[0, 4, 4, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <style>{`
        .overview-stats {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .overview-adherence,
        .overview-streak,
        .overview-categories {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .overview-adherence h3,
        .overview-streak h3,
        .overview-categories h3 {
          font-size: 15px;
        }
        .overview-adherence-sub {
          font-size: 13px;
          color: var(--text-muted);
        }
        .overview-streak-figures {
          display: flex;
          gap: var(--space-5);
        }
        .overview-streak-figure {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .overview-streak-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--accent);
        }
        .overview-streak-label {
          font-size: 13px;
          color: var(--text-muted);
        }
        .progress-empty-sub {
          color: var(--text-muted);
          font-size: 14px;
        }
        .overview-tooltip {
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: var(--space-2) var(--space-3);
          font-size: 12px;
        }
        .overview-tooltip-category {
          color: var(--text-muted);
          margin-bottom: 2px;
        }
        .overview-tooltip-count {
          font-weight: 700;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
