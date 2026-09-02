// Drives SessionTrackerPage: subscribes to one trackedSessions doc, exposes
// its exercises as local optimistic state, and persists every change with a
// short debounce - the direct replacement for the old explicit
// "Save exercise" / "Finish session" buttons (see SessionTrackerPage).
import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { TrackedExercise, TrackedSession } from "../../lib/types";
import { computeTrackedSessionStatus, syncWorkoutLog } from "./trackedSessionActions";

const AUTOSAVE_DEBOUNCE_MS = 600;

function loggedSnapshotKey(exercises: TrackedExercise[]): string {
  // "logged" also covers a no-machine category tap (gymId === null path),
  // which resolves with zero sets - see SessionTrackerPage/syncWorkoutLog.
  return JSON.stringify(exercises.filter((ex) => ex.status !== "pending"));
}

export function useAutosaveTrackedSession(uid: string | undefined, sessionId: string | undefined) {
  const [session, setSession] = useState<TrackedSession | null | undefined>(undefined);
  const [exercises, setExercises] = useState<TrackedExercise[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestExercisesRef = useRef<TrackedExercise[]>([]);
  // The "already synced to workoutLogs as of this visit's start" baseline -
  // seeded ONCE from the first snapshot only (not every snapshot echo of our
  // own autosave writes, which would otherwise make the unmount comparison
  // below always see "no change" and silently skip the sync event - see
  // the project plan's adherence/sweep section for why that sync matters).
  const lastSyncedKeyRef = useRef<string>("[]");
  const initializedRef = useRef(false);
  const sessionRef = useRef<TrackedSession | null>(null);

  useEffect(() => {
    sessionRef.current = session ?? null;
  }, [session]);

  useEffect(() => {
    if (!uid || !sessionId) return;
    initializedRef.current = false;
    return onSnapshot(doc(db, "users", uid, "trackedSessions", sessionId), (snap) => {
      if (!snap.exists()) {
        setSession(null);
        return;
      }
      const data = { id: snap.id, ...(snap.data() as Omit<TrackedSession, "id">) };
      setSession(data);

      // Skip adopting the snapshot's exercises while a local edit is still
      // in flight (debounceRef set) - otherwise our own write's echo can
      // snap a rapid stepper tap backward for a frame.
      if (!debounceRef.current) {
        setExercises(data.exercises);
        latestExercisesRef.current = data.exercises;
      }

      if (!initializedRef.current) {
        lastSyncedKeyRef.current = loggedSnapshotKey(data.exercises);
        initializedRef.current = true;
      }
    });
  }, [uid, sessionId]);

  const flush = useCallback(
    (next: TrackedExercise[]) => {
      if (!uid || !sessionId) return;
      void setDoc(
        doc(db, "users", uid, "trackedSessions", sessionId),
        { exercises: next, status: computeTrackedSessionStatus(next), updatedAt: serverTimestamp() },
        { merge: true }
      );
    },
    [uid, sessionId]
  );

  const updateExercises = useCallback(
    (updater: (prev: TrackedExercise[]) => TrackedExercise[]) => {
      setExercises((prev) => {
        const next = updater(prev);
        latestExercisesRef.current = next;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          debounceRef.current = null;
          flush(next);
        }, AUTOSAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [flush]
  );

  // Flush any pending write and fire the one-time workoutLogs sync event
  // (trackedSessionActions.syncWorkoutLog) on navigation away - this is the
  // only remaining trigger for that sync, replacing the old "Finish" button.
  useEffect(() => {
    return () => {
      if (!uid || !sessionId) return;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        flush(latestExercisesRef.current);
      }
      const key = loggedSnapshotKey(latestExercisesRef.current);
      const base = sessionRef.current;
      if (base && key !== lastSyncedKeyRef.current && key !== "[]") {
        void syncWorkoutLog(uid, { ...base, id: sessionId, exercises: latestExercisesRef.current }).catch(() => {
          // Best-effort: adherence/stats sync failing shouldn't block navigation.
        });
      }
    };
    // Intentionally re-created only when uid/sessionId change (mount/unmount
    // for this session), not on every keystroke - see sessionRef/latestExercisesRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, sessionId]);

  return { session, exercises, updateExercises };
}
