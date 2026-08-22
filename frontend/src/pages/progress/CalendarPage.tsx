// First-class /calendar route promoting MonthAgenda out of its old
// HomePage-overlay-only existence, per the bright-mode visual pass (a real
// month-strip + hero-date surface instead of a modal peek). Entry point is a
// "View calendar" link from HomePage rather than a 6th bottom-nav tab, to
// keep AppShell's existing 5-tab layout intact.
import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import MonthAgenda from "../../features/plan/MonthAgenda";
import { toLocalDateKey } from "../../features/plan/planDate";
import type { PlanDoc, TrackedSession } from "../../lib/types";

export default function CalendarPage() {
  const { user, profile } = useAuth();
  const [plan, setPlan] = useState<PlanDoc | null | undefined>(undefined);
  const [tracked, setTracked] = useState<TrackedSession[]>([]);
  const today = useMemo(() => toLocalDateKey(new Date()), []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid, "plans", "current"), (snap) => {
      setPlan(snap.exists() ? (snap.data() as PlanDoc) : null);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "users", user.uid, "trackedSessions"), (snap) =>
      setTracked(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TrackedSession, "id">) })))
    );
  }, [user]);

  if (plan === undefined) return <div className="card">Loading your calendar...</div>;
  if (plan === null) return <div className="card">Setting up your plan... this usually only takes a moment.</div>;

  return (
    <div className="calendar-page">
      <MonthAgenda
        sessions={plan.sessions}
        trackedSessions={tracked}
        today={today}
        weekStartsOn={profile?.settings?.weekStartsOn ?? 1}
      />

      <style>{`
        .calendar-page {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
      `}</style>
    </div>
  );
}
