// Shared motion configuration - a sibling to lib/theme.ts, not a second
// styling system. Components still own their static visual styling in their
// trailing <style>{} JSX block (see index.css comment); this file only owns
// *behavior* (spring presets, shared variants) passed as props to <m.div>
// etc. Import { m } (not the full <motion.div>) alongside LazyMotion +
// domAnimation in each consumer, scoped to that component/route's already-
// lazy chunk - see SessionTrackerPage.tsx for the pattern. This keeps
// `motion` fully out of the eager main bundle: nothing in this redesign
// needs cross-route transitions, so there's no reason to wrap App.tsx/
// Routes in it.
import { useEffect, useState } from "react";

/** Snappy, slightly overshooting - for tactile tap feedback (steppers, cards). */
export const springSnappy = { type: "spring" as const, stiffness: 500, damping: 30 };

/** Softer, more deliberate - for sheets and larger surfaces entering/leaving. */
export const springSoft = { type: "spring" as const, stiffness: 300, damping: 32 };

/** Bottom-sheet slide-up + backdrop fade, shared by Sheet.tsx's every consumer. */
export const sheetVariants = {
  backdrop: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  panel: {
    hidden: { y: "100%", opacity: 0 },
    visible: { y: 0, opacity: 1 },
  },
};

/**
 * Tracks the user's OS-level reduced-motion preference. The codebase has no
 * reduced-motion handling today - every new motion consumer should check
 * this and fall back to an instant/no-op transition rather than skip the
 * check, since a motion-heavy redesign without it is an accessibility
 * regression, not a nice-to-have.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** whileTap scale for reduced-motion-aware tactile feedback - pass `{}` instead when reduced. */
export const tapScale = { scale: 0.85 };
