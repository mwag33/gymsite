// Simple inline-SVG pictograms for the curated machine catalog. There's no
// image source or image-generation tool available in this environment, so
// these are hand-drawn line-art abstractions (seat/lever/pulley/weight-stack
// shapes) rather than photos - same stroke-icon visual language as
// components/icons.tsx, just a distinct lookup keyed by catalog id.
import type { ReactElement, SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

const SHAPES: Record<string, ReactElement> = {
  "leg-press": (
    <>
      <path d="M3 19h4" />
      <path d="M7 19 17 7" />
      <rect x="16" y="4" width="4" height="5" />
    </>
  ),
  "squat-rack": (
    <>
      <path d="M6 2v20M18 2v20" />
      <path d="M4 9h4M16 9h4" />
      <path d="M8 9h8" />
    </>
  ),
  "leg-extension": (
    <>
      <rect x="3" y="15" width="5" height="3" rx="1" />
      <path d="M8 16.5h6" />
      <path d="M14 16.5 18 10" />
      <rect x="16.5" y="7" width="3" height="4" />
    </>
  ),
  "leg-curl": (
    <>
      <rect x="3" y="10" width="10" height="3" rx="1" />
      <path d="M13 11.5h4" />
      <path d="M17 11.5 20 16" />
      <rect x="18.5" y="16" width="3" height="4" />
    </>
  ),
  "hip-abductor-adductor": (
    <>
      <rect x="9" y="10" width="6" height="6" rx="1" />
      <path d="M9 12 4 9M15 12l5-3M9 14 4 17M15 14l5 3" />
    </>
  ),
  "smith-machine": (
    <>
      <path d="M6 2v20M18 2v20" />
      <rect x="5" y="10" width="14" height="2" rx="1" />
    </>
  ),
  "lat-pulldown": (
    <>
      <rect x="9" y="16" width="6" height="3" rx="1" />
      <path d="M12 16V6" />
      <circle cx="12" cy="4" r="1.5" />
      <path d="M7 8h10" />
    </>
  ),
  "seated-cable-row": (
    <>
      <rect x="4" y="14" width="5" height="3" rx="1" />
      <path d="M9 15.5h9" />
      <circle cx="20" cy="15.5" r="1.5" />
      <path d="M14 13v5" />
    </>
  ),
  "assisted-pullup-dip": (
    <>
      <path d="M7 2v14M17 2v14" />
      <rect x="9" y="16" width="6" height="3" rx="1" />
    </>
  ),
  "chest-press": (
    <>
      <rect x="3" y="10" width="4" height="8" rx="1" />
      <path d="M7 12h5M7 16h5" />
      <circle cx="14" cy="12" r="1.2" />
      <circle cx="14" cy="16" r="1.2" />
      <rect x="18" y="6" width="3" height="8" />
    </>
  ),
  "pec-deck": (
    <>
      <rect x="10" y="8" width="4" height="10" rx="1" />
      <path d="M10 10C6 10 4 13 3 16M14 10c4 0 6 3 7 6" />
    </>
  ),
  "cable-crossover": (
    <>
      <circle cx="3" cy="4" r="1.2" />
      <circle cx="21" cy="4" r="1.2" />
      <path d="M3 4 15 20M21 4 9 20" />
    </>
  ),
  "shoulder-press": (
    <>
      <rect x="5" y="14" width="5" height="6" rx="1" />
      <path d="M8 14V6M13 14V6" />
      <circle cx="8" cy="5" r="1.2" />
      <circle cx="13" cy="5" r="1.2" />
    </>
  ),
  "cable-tricep-pushdown": (
    <>
      <circle cx="12" cy="4" r="1.2" />
      <path d="M12 5v9" />
      <path d="M8 14h8" />
      <path d="M9 14v5M15 14v5" />
    </>
  ),
  "preacher-curl": (
    <>
      <path d="M4 18 10 10" />
      <rect x="9" y="7" width="6" height="3" rx="1" />
      <path d="M9 8.5h6" />
      <circle cx="8" cy="8.5" r="1" />
      <circle cx="16" cy="8.5" r="1" />
    </>
  ),
  "ab-crunch-machine": (
    <>
      <path d="M4 18c2-6 6-9 10-9" />
      <rect x="13" y="7" width="4" height="3" rx="1" />
      <path d="M15 10v3" />
    </>
  ),
  treadmill: (
    <>
      <rect x="3" y="16" width="14" height="3" rx="1.5" />
      <path d="M17 16 20 6" />
      <rect x="18.5" y="4" width="3" height="3" />
    </>
  ),
  "stationary-bike": (
    <>
      <circle cx="8" cy="16" r="4" />
      <path d="M8 12 14 8M14 8h4M14 8l2 8" />
      <path d="M10 6h2" />
    </>
  ),
  "rowing-machine": (
    <>
      <path d="M2 18h20" />
      <rect x="6" y="15" width="4" height="2" rx="1" />
      <path d="M10 16h6" />
      <circle cx="18" cy="16" r="1.2" />
    </>
  ),
  elliptical: (
    <>
      <ellipse cx="7" cy="17" rx="4" ry="2" />
      <path d="M7 15 15 5" />
      <path d="M15 5v6M15 5h4" />
    </>
  ),
};

const GENERIC_SHAPE = (
  <>
    <circle cx="4" cy="12" r="2" />
    <circle cx="20" cy="12" r="2" />
    <path d="M6 12h12" />
    <path d="M9 9v6M15 9v6" />
  </>
);

interface MachineIconProps extends SVGProps<SVGSVGElement> {
  iconId: string;
}

/** Renders the catalog pictogram for `iconId`, or a generic dumbbell icon if there's no match. */
export default function MachineIcon({ iconId, ...props }: MachineIconProps) {
  return <Icon {...props}>{SHAPES[iconId] ?? GENERIC_SHAPE}</Icon>;
}
