// Shared bottom-sheet primitive - one implementation instead of each
// consumer (SessionTrackerPage's exercise editor, MachinePicker's overlay)
// hand-rolling its own slide-up/backdrop treatment. LazyMotion + domAnimation
// keeps `motion`'s reduced feature set scoped to whichever already-lazy
// route chunk imports this, rather than the full animation engine - see
// lib/motion.ts's file comment for why nothing here wraps App.tsx/Routes.
import type { ReactNode } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { sheetVariants, springSoft, usePrefersReducedMotion } from "../lib/motion";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function Sheet({ open, onClose, children }: SheetProps) {
  const reducedMotion = usePrefersReducedMotion();
  const transition = reducedMotion ? { duration: 0 } : springSoft;

  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence>
        {open && (
          <m.div
            className="sheet-backdrop"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={sheetVariants.backdrop}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            onClick={onClose}
          >
            <m.div
              className="sheet-panel"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={sheetVariants.panel}
              transition={transition}
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      <style>{`
        .sheet-backdrop {
          position: fixed;
          inset: 0;
          z-index: 20;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          align-items: flex-end;
        }
        .sheet-panel {
          width: 100%;
          max-height: 85vh;
          overflow-y: auto;
          background: var(--surface);
          border-radius: var(--radius-lg) var(--radius-lg) 0 0;
          box-shadow: var(--shadow-lg);
          padding: var(--space-4);
          padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
        }
      `}</style>
    </LazyMotion>
  );
}
