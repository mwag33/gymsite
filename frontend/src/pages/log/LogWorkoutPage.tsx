// Thin get-or-create redirect: the bottom-nav "/log" and "/log/:date" URL
// contract is unchanged, but the actual session-first logging UI now lives
// at /session/:sessionId (SessionTrackerPage). This page just resolves which
// tracked session (if any) the target date should open, or sends the user to
// /day/:date to accept a suggestion or choose among several tracked sessions.
// No active-gym special case: SessionTrackerPage itself handles gymId ===
// null with a simple category-tap flow (see its no-gym branch), so a
// tracked session is created either way - there's no longer a separate
// gym-less logging surface (the old SimpleLogView).
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { toLocalDateKey } from "../../features/plan/planDate";
import type { TrackedSession } from "../../lib/types";

export default function LogWorkoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { date: dateParam } = useParams<{ date?: string }>();
  const today = useMemo(() => toLocalDateKey(new Date()), []);
  const targetDate = dateParam ?? today;

  const [tracked, setTracked] = useState<TrackedSession[] | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    setTracked(undefined);
    return onSnapshot(
      query(collection(db, "users", user.uid, "trackedSessions"), where("date", "==", targetDate)),
      (snap) => setTracked(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TrackedSession, "id">) })))
    );
  }, [user, targetDate]);

  useEffect(() => {
    if (!user || !tracked) return;
    if (tracked.length === 1) {
      navigate(`/session/${tracked[0].id}`, { replace: true });
    } else {
      // 0 tracked sessions (needs /day to accept a suggestion or start ad
      // hoc) or >1 (needs /day to pick which one) both resolve to the same
      // place - DayDetailPage lists every case.
      navigate(`/day/${targetDate}`, { replace: true });
    }
  }, [user, tracked, targetDate, navigate]);

  if (!user) return null;

  return <div className="card">Loading...</div>;
}
