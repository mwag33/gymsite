// Drives the /day/:date logging page: subscribes to one `daySessions/{date}`
// doc (which may not exist yet), exposes its exercises as local optimistic
// state, and persists every change with a short debounce. Replaces the old
// useAutosaveTrackedSession - same autosave shape, but get-or-create instead
// of assuming the doc already exists, and a per-exercise stats sync instead
// of one sync-on-unmount for the whole session (see dayActions.ts's
// syncLoggedExercise: there's no single "session end" moment anymore now
// that a day is editable any time).
import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { DaySession, TrackedExercise, TrainingPlanFocus } from "../../lib/types";
import { createDaySession, setDayExercises, setDayFocus, syncLoggedExercise } from "./dayActions";

const AUTOSAVE_DEBOUNCE_MS = 600;

export function useDaySession(
  uid: string | undefined,
  date: string | undefined,
  defaultFocus: TrainingPlanFocus,
  gymId: string | null
) {
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [focus, setFocusState] = useState<TrainingPlanFocus>(defaultFocus);
  const [exercises, setExercises] = useState<TrackedExercise[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const existsRef = useRef(false);
  const focusRef = useRef<TrainingPlanFocus>(defaultFocus);

  useEffect(() => {
    if (!uid || !date) return;
    setLoading(true);
    return onSnapshot(doc(db, "users", uid, "daySessions", date), (snap) => {
      setLoading(false);
      if (!snap.exists()) {
        existsRef.current = false;
        setExists(false);
        return;
      }
      const data = snap.data() as DaySession;
      existsRef.current = true;
      setExists(true);
      focusRef.current = data.focus;
      setFocusState(data.focus);
      // Skip adopting the snapshot's exercises while a local edit is still
      // debouncing - otherwise our own write's echo can snap a rapid
      // stepper tap backward for a frame.
      if (!debounceRef.current) {
        setExercises(data.exercises);
      }
    });
  }, [uid, date]);

  // A fresh (never-visited) day has no doc yet - fall back to the pattern
  // default until the snapshot above proves otherwise.
  useEffect(() => {
    if (!existsRef.current) {
      focusRef.current = defaultFocus;
      setFocusState(defaultFocus);
    }
  }, [defaultFocus]);

  const flush = useCallback(
    (next: TrackedExercise[]) => {
      if (!uid || !date) return;
      void setDayExercises(uid, date, next, focusRef.current, gymId, existsRef.current);
      existsRef.current = true;
    },
    [uid, date, gymId]
  );

  const updateExercises = useCallback(
    (updater: (prev: TrackedExercise[]) => TrackedExercise[]) => {
      setExercises((prev) => {
        const next = updater(prev);

        // Fire the machineStats sync for any exercise crossing into
        // "logged" for the first time - once per exercise, ever.
        const newlyLogged = next.filter((ex) => {
          if (ex.status !== "logged" || ex.firstLoggedAt) return false;
          const before = prev.find((p) => p.id === ex.id);
          return !before || before.status !== "logged";
        });
        const stamped = newlyLogged.length === 0
          ? next
          : next.map((ex) =>
              newlyLogged.some((n) => n.id === ex.id) ? { ...ex, firstLoggedAt: Timestamp.now() } : ex
            );

        if (uid) {
          for (const ex of newlyLogged) void syncLoggedExercise(uid, gymId, ex);
        }

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          debounceRef.current = null;
          flush(stamped);
        }, AUTOSAVE_DEBOUNCE_MS);
        return stamped;
      });
    },
    [flush, uid, gymId]
  );

  const setFocus = useCallback(
    async (next: TrainingPlanFocus) => {
      if (!uid || !date) return;
      focusRef.current = next;
      setFocusState(next);
      await setDayFocus(uid, date, next, gymId, existsRef.current);
      existsRef.current = true;
    },
    [uid, date, gymId]
  );

  // Ensures a doc exists even if the user never explicitly changes the
  // focus or logs anything logged-worthy (e.g. only skips exercises) -
  // harmless no-op if a doc already exists.
  const ensureExists = useCallback(async () => {
    if (!uid || !date || existsRef.current) return;
    await createDaySession(uid, date, focusRef.current, gymId);
    existsRef.current = true;
  }, [uid, date, gymId]);

  return { loading, exists, focus, exercises, updateExercises, setFocus, ensureExists };
}
