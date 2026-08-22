import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveGym } from "../../contexts/ActiveGymContext";
import { generateExercisesForWeek } from "../../lib/callables";
import AdherenceMeter from "../../components/AdherenceMeter";
import TodayHero from "../../features/plan/TodayHero";
import DateStrip from "../../features/plan/DateStrip";
import UpcomingList from "../../features/plan/UpcomingList";
import { mergeDaySessions } from "../../features/plan/mergeSessions";
import { addDaysToKey, toLocalDateKey } from "../../features/plan/planDate";
import type { PlanDoc, TrackedSession } from "../../lib/types";

// A week is "close enough to running out" once the exercise horizon is
// within this many days of today — matches the plan's rolling-fill trigger.
const HORIZON_REFILL_THRESHOLD_DAYS = 7;
// How many days of the rolling window the date strip shows at once.
const DATE_STRIP_WINDOW_DAYS = 7;

export default function HomePage() {
  const { user, profile } = useAuth();
  const { activeGym } = useActiveGym();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanDoc | null | undefined>(undefined);
  const [trackedSessions, setTrackedSessions] = useState<TrackedSession[]>([]);
  const horizonRefillRequested = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setPlan(undefined);
    return onSnapshot(doc(db, "users", user.uid, "plans", "current"), (snap) => {
      setPlan(snap.exists() ? (snap.data() as PlanDoc) : null);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "users", user.uid, "trackedSessions"), (snap) =>
      setTrackedSessions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TrackedSession, "id">) })))
    );
  }, [user]);

  const today = useMemo(() => toLocalDateKey(new Date()), []);

  // Rolling exercise-horizon extension: the only place this fires. Guarded
  // by a ref keyed on the horizon value itself so a snapshot re-render (or a
  // horizon that hasn't moved yet) never re-issues the same AI call.
  useEffect(() => {
    if (!plan) return;
    const refillThreshold = addDaysToKey(today, HORIZON_REFILL_THRESHOLD_DAYS);
    const needsRefill = plan.exerciseHorizon <= refillThreshold;
    if (!needsRefill) return;
    if (horizonRefillRequested.current === plan.exerciseHorizon) return;
    horizonRefillRequested.current = plan.exerciseHorizon;
    void generateExercisesForWeek({
      experience: profile?.experienceLevel ?? "some_experience",
      sessionLengthMinutes: profile?.sessionLengthMinutes ?? 45,
      gymId: activeGym?.id ?? null,
    }).catch(() => {
      // Best-effort background refill — if it fails, the next mount (or the
      // horizon still being stale) will simply retry. Not worth surfacing a
      // toast for a background maintenance call.
      horizonRefillRequested.current = null;
    });
  }, [plan, today, profile, activeGym]);

  if (plan === undefined) {
    return <div className="card">Loading your plan...</div>;
  }

  if (plan === null) {
    return <div className="card">Setting up your plan... this usually only takes a moment.</div>;
  }

  const todayView = mergeDaySessions(plan.sessions, trackedSessions, today);
  const windowEnd = addDaysToKey(today, DATE_STRIP_WINDOW_DAYS);
  const stripSessions = plan.sessions.filter((s) => s.date >= today && s.date <= windowEnd);

  const trainingThisWindow = stripSessions.filter((s) => s.focus !== "rest");
  const completedThisWindow = trainingThisWindow.filter(
    (s) => s.status === "done" || s.status === "partial"
  ).length;

  return (
    <div className="home-page">
      <AdherenceMeter
        compact
        completed={completedThisWindow}
        target={plan.frequencyPerWeek || trainingThisWindow.length || null}
      />

      <TodayHero today={todayView} />

      <DateStrip sessions={stripSessions} today={today} />

      <UpcomingList sessions={plan.sessions} today={today} onOpenMonth={() => navigate("/calendar")} />

      <style>{`
        .home-page {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
      `}</style>
    </div>
  );
}
