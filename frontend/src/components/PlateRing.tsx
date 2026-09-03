// The app's signature device: a progress/status ring styled after an actual
// weight plate - a thick torus with a few evenly-spaced grip-hole notches,
// filled proportionally. Replaces the old flat AdherenceMeter *bar* (a real
// shape change, not a restyle) and the flat status pills elsewhere. At
// small sizes (MonthAgenda's day cells) pass notches={0} for a plain filled
// arc - a full plate doesn't read cleanly below ~48px, see the design plan.
//
// Self-contained LazyMotion wrapper: PlateRing is used from places that
// already have a `motion` context in their tree (DayLogPage, via Sheet.tsx)
// and places that don't (OverviewStats.tsx, HomePage.tsx), so it can't
// assume an ancestor provider. `domAnimation`'s module is deduped by the
// bundler within whatever lazy chunk imports this, so multiple rings on one
// page don't multiply the cost - see lib/motion.ts.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { springSoft, usePrefersReducedMotion } from "../lib/motion";

const VIEWBOX = 100;
const CENTER = VIEWBOX / 2;
const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface PlateRingProps {
  /** Outer diameter in px. */
  size: number;
  /** 0-1. */
  fillPercent: number;
  /** Ring fill color - defaults to the accent token. */
  color?: string;
  /** Grip-hole count. 0 = plain filled arc, for small/cell-scale usage. */
  notches?: number;
  /** Color the punched-through notches render as - match whatever surface the ring sits on. */
  holeColor?: string;
  /** Centered content - a fraction, a checkmark, nothing. */
  label?: ReactNode;
  /**
   * One-shot celebration trigger: flip this from false to true (e.g. on the
   * "in_progress" -> "done" edge, computed locally - see
   * dayActions.computeDaySessionStatus) to fire a single volt-colored flash.
   * Does not stay lit - it's a moment, not a state.
   */
  celebrate?: boolean;
}

export default function PlateRing({
  size,
  fillPercent,
  color = "var(--accent)",
  notches = 4,
  holeColor = "var(--surface)",
  label,
  celebrate = false,
}: PlateRingProps) {
  const reducedMotion = usePrefersReducedMotion();
  const clamped = Math.max(0, Math.min(1, fillPercent));
  const [flashing, setFlashing] = useState(false);
  const wasCelebrateRef = useRef(celebrate);

  useEffect(() => {
    if (celebrate && !wasCelebrateRef.current) {
      setFlashing(true);
      const t = window.setTimeout(() => setFlashing(false), reducedMotion ? 0 : 700);
      wasCelebrateRef.current = celebrate;
      return () => window.clearTimeout(t);
    }
    wasCelebrateRef.current = celebrate;
  }, [celebrate, reducedMotion]);

  const strokeWidth = Math.max(6, size * 0.1);
  const notchRadius = Math.max(2, strokeWidth * 0.32);
  const holes =
    notches > 0
      ? Array.from({ length: notches }, (_, i) => {
          const angle = (i / notches) * 2 * Math.PI - Math.PI / 2;
          return {
            cx: CENTER + RADIUS * Math.cos(angle),
            cy: CENTER + RADIUS * Math.sin(angle),
          };
        })
      : [];

  // No embedded <style> here, unlike most components in this codebase -
  // PlateRing is instantiated dozens of times in one render (MonthAgenda's
  // full month grid), so its CSS lives once in index.css (alongside .card/
  // .btn) rather than being duplicated into the DOM per instance.
  return (
    <LazyMotion features={domAnimation} strict>
      <div className="plate-ring" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} width={size} height={size}>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
          <m.circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - clamped) }}
            transition={reducedMotion ? { duration: 0 } : springSoft}
          />
          {holes.map((hole, i) => (
            <circle key={i} cx={hole.cx} cy={hole.cy} r={notchRadius} fill={holeColor} />
          ))}
        </svg>

        {label !== undefined && <div className="plate-ring-label tnum">{label}</div>}

        <AnimatePresence>
          {flashing && (
            <m.div
              className="plate-ring-flash"
              initial={{ opacity: 0.7, scale: 1 }}
              animate={{ opacity: 0, scale: 1.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
      </div>
    </LazyMotion>
  );
}
