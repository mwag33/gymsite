import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveGym } from "../../contexts/ActiveGymContext";
import { generateExercisesForWeek } from "../../lib/callables";
import PlateRing from "../../components/PlateRing";
import TodayHero from "../../features/plan/TodayHero";
import MonthAgenda from "../../features/plan/MonthAgenda";
import { mergeDaySessions } from "../../features/plan/mergeSessions";
import { addDaysToKey, toLocalDateKey } from "../../features/plan/planDate";
import type { PlanDoc, TrackedSession } from "../../lib/types";

// A week is "close enough to running out" once the exercise horizon is
// within this many days of today — matches the plan's rolling-fill trigger.
const HORIZON_REFILL_THRESHOLD_DAYS = 7;
// Rolling 7-day window the hero adherence ring reports against - kept
// intentionally weekly/pace-focused even though the month grid below it
// covers the whole month; two different questions, both useful. See the
// design plan's "adherence scope" decision.
const ADHERENCE_WINDOW_DAYS = 7;

export default function HomePage() {
  const { user, profile } = useAuth();
  const { activeGym } = useActiveGym();
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
  const windowEnd = addDaysToKey(today, ADHERENCE_WINDOW_DAYS);
  const stripSessions = plan.sessions.filter((s) => s.date >= today && s.date <= windowEnd);

  const trainingThisWindow = stripSessions.filter((s) => s.focus !== "rest");
  const completedThisWindow = trainingThisWindow.filter(
    (s) => s.status === "done" || s.status === "partial"
  ).length;
  const weekTarget = plan.frequencyPerWeek || trainingThisWindow.length || null;

  return (
    <div className="home-page">
      <div className="home-adherence">
        <PlateRing
          size={56}
          fillPercent={weekTarget ? completedThisWindow / weekTarget : 0}
          label={weekTarget ? `${completedThisWindow}/${weekTarget}` : completedThisWindow}
        />
        <div>
          <p className="home-adherence-eyebrow">This week</p>
          <p className="home-adherence-headline">
            {weekTarget
              ? `${completedThisWindow} of ${weekTarget} sessions`
              : `${completedThisWindow} session${completedThisWindow === 1 ? "" : "s"} logged`}
          </p>
        </div>
      </div>

      <TodayHero today={todayView} />

      <MonthAgenda
        sessions={plan.sessions}
        trackedSessions={trackedSessions}
        today={today}
        weekStartsOn={profile?.settings?.weekStartsOn ?? 1}
      />

      <style>{`
        .home-page {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .home-adherence {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .home-adherence-eyebrow {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }
        .home-adherence-headline {
          font-size: 16px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
