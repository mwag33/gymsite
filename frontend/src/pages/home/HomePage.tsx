import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import PlanReveal from "../../features/plan/PlanReveal";
import type { TrainingPlan } from "../../lib/types";

export default function HomePage() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<TrainingPlan | null | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    setPlan(undefined);
    return onSnapshot(doc(db, "users", user.uid, "trainingPlans", "current"), (snap) => {
      setPlan(snap.exists() ? (snap.data() as TrainingPlan) : null);
    });
  }, [user]);

  if (plan === undefined) {
    return <div className="card">Loading your plan...</div>;
  }

  if (plan === null) {
    return <div className="card">Setting up your plan... this usually only takes a moment.</div>;
  }

  const trainingDays = plan.days.filter((d) => d.focus !== "rest");
  const totalSessions = plan.frequencyPerWeek || trainingDays.length;
  const restDays = plan.days.length - trainingDays.length;

  return (
    <div className="home-page">
      <div className="home-summary">
        This week: <strong className="tnum">{totalSessions}</strong> sessions planned,{" "}
        <strong className="tnum">{restDays}</strong> rest days
      </div>
      <PlanReveal
        plan={plan}
        mode="recalculated"
        onPlanChange={(days) => setPlan((prev) => (prev ? { ...prev, days } : prev))}
      />

      <style>{`
        .home-page {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .home-summary {
          color: var(--text-muted);
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
