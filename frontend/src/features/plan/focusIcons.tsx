// Original stroke-icon pictograms per training focus, in the same minimal
// style as components/icons.tsx (24x24, stroke currentColor, round caps) so
// day chips/rows read at a glance without relying on any third-party
// artwork or product photography.
import type { ReactElement, SVGProps } from "react";
import type { TrainingPlanFocus } from "../../lib/types";

function Glyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

// Barbell, viewed side-on - bench press.
function ChestGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <path d="M2 12h2M20 12h2M5 12h14" />
      <rect x="4" y="9" width="3" height="6" rx="1" />
      <rect x="17" y="9" width="3" height="6" rx="1" />
    </Glyph>
  );
}

// Overhead pulldown bar with two downward pull arrows.
function BackGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <path d="M4 6h16" />
      <path d="M8 6v6M8 12l-2.5-2.5M8 12l2.5-2.5" />
      <path d="M16 6v6M16 12l-2.5-2.5M16 12l2.5-2.5" />
    </Glyph>
  );
}

// Bent leg mid-squat.
function LegsGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <path d="M9 3v7l-3 5v6" />
      <path d="M9 10h5l2 5v6" />
      <path d="M6 21h3M13 21h3" />
    </Glyph>
  );
}

// Rounded torso with ab segment lines.
function CoreGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <rect x="7" y="4" width="10" height="16" rx="4" />
      <path d="M9 9h6M9 13h6M9 17h6" />
    </Glyph>
  );
}

// Heartbeat pulse line.
function CardioGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <path d="M2 13h4l2-6 3 12 2.5-9 1.5 3h7" />
    </Glyph>
  );
}

// Dumbbell, angled - shoulder/overhead press.
function UpperBodyGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <path d="M8 16 16 8" />
      <rect x="5.5" y="14.5" width="4" height="4" rx="1" transform="rotate(-45 7.5 16.5)" />
      <rect x="14.5" y="5.5" width="4" height="4" rx="1" transform="rotate(-45 16.5 7.5)" />
    </Glyph>
  );
}

// Crescent moon - rest day.
function RestGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <path d="M16 3.5a8 8 0 1 0 0 17 8 8 0 0 1 0-17Z" />
    </Glyph>
  );
}

const FOCUS_GLYPHS: Record<TrainingPlanFocus, (props: SVGProps<SVGSVGElement>) => ReactElement> = {
  chest: ChestGlyph,
  back: BackGlyph,
  legs: LegsGlyph,
  core: CoreGlyph,
  cardio: CardioGlyph,
  upper_body: UpperBodyGlyph,
  other: CoreGlyph,
  rest: RestGlyph,
};

export function FocusIcon({
  focus,
  ...props
}: { focus: TrainingPlanFocus } & SVGProps<SVGSVGElement>) {
  const Glyph = FOCUS_GLYPHS[focus];
  return <Glyph {...props} />;
}
