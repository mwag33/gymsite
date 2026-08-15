// Simplified front/back body silhouette that highlights the muscle groups an
// exercise/machine works. No image source or image-generation tool is
// available, so this is a stylized "blocky" pictogram (geometric regions,
// not anatomical art) - the same trade-off as MachineIcon.tsx.
import type { MuscleGroup } from "../lib/types";

interface Region {
  group: MuscleGroup;
  d?: string;
  shape?: "rect" | "ellipse";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rx?: number;
  cx?: number;
  cy?: number;
  rxEllipse?: number;
  ryEllipse?: number;
}

const FRONT_REGIONS: Region[] = [
  { group: "shoulders", shape: "ellipse", cx: 30, cy: 30, rxEllipse: 10, ryEllipse: 7 },
  { group: "shoulders", shape: "ellipse", cx: 70, cy: 30, rxEllipse: 10, ryEllipse: 7 },
  { group: "chest", shape: "rect", x: 36, y: 32, width: 28, height: 24, rx: 6 },
  { group: "biceps", shape: "rect", x: 14, y: 40, width: 12, height: 30, rx: 6 },
  { group: "biceps", shape: "rect", x: 74, y: 40, width: 12, height: 30, rx: 6 },
  { group: "forearms", shape: "rect", x: 12, y: 72, width: 11, height: 28, rx: 5 },
  { group: "forearms", shape: "rect", x: 77, y: 72, width: 11, height: 28, rx: 5 },
  { group: "abs", shape: "rect", x: 38, y: 60, width: 24, height: 30, rx: 6 },
  { group: "obliques", shape: "rect", x: 30, y: 64, width: 8, height: 24, rx: 3 },
  { group: "obliques", shape: "rect", x: 62, y: 64, width: 8, height: 24, rx: 3 },
  { group: "quads", shape: "rect", x: 32, y: 94, width: 16, height: 40, rx: 6 },
  { group: "quads", shape: "rect", x: 52, y: 94, width: 16, height: 40, rx: 6 },
];

const BACK_REGIONS: Region[] = [
  { group: "upper_back", shape: "rect", x: 36, y: 30, width: 28, height: 20, rx: 6 },
  { group: "lats", shape: "rect", x: 26, y: 44, width: 14, height: 26, rx: 6 },
  { group: "lats", shape: "rect", x: 60, y: 44, width: 14, height: 26, rx: 6 },
  { group: "triceps", shape: "rect", x: 14, y: 40, width: 12, height: 30, rx: 6 },
  { group: "triceps", shape: "rect", x: 74, y: 40, width: 12, height: 30, rx: 6 },
  { group: "forearms", shape: "rect", x: 12, y: 72, width: 11, height: 28, rx: 5 },
  { group: "forearms", shape: "rect", x: 77, y: 72, width: 11, height: 28, rx: 5 },
  { group: "glutes", shape: "rect", x: 36, y: 88, width: 28, height: 18, rx: 8 },
  { group: "hamstrings", shape: "rect", x: 32, y: 106, width: 16, height: 30, rx: 6 },
  { group: "hamstrings", shape: "rect", x: 52, y: 106, width: 16, height: 30, rx: 6 },
  { group: "calves", shape: "rect", x: 32, y: 140, width: 16, height: 32, rx: 6 },
  { group: "calves", shape: "rect", x: 52, y: 140, width: 16, height: 32, rx: 6 },
];

function Silhouette({
  regions,
  active,
  label,
}: {
  regions: Region[];
  active: Set<MuscleGroup>;
  label: string;
}) {
  return (
    <svg viewBox="0 0 100 200" width="36" height="72" role="img" aria-label={label}>
      <circle cx="50" cy="14" r="10" fill="var(--border)" />
      <rect x="46" y="22" width="8" height="6" fill="var(--border)" />
      <rect x="32" y="134" width="16" height="42" rx="4" fill="var(--border)" />
      <rect x="52" y="134" width="16" height="42" rx="4" fill="var(--border)" />
      {regions.map((r, i) => {
        const isActive = active.has(r.group);
        const fill = isActive ? "var(--accent)" : "var(--border)";
        if (r.shape === "ellipse") {
          return (
            <ellipse
              key={i}
              cx={r.cx}
              cy={r.cy}
              rx={r.rxEllipse}
              ry={r.ryEllipse}
              fill={fill}
              opacity={isActive ? 1 : 0.6}
            />
          );
        }
        return (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
            rx={r.rx}
            fill={fill}
            opacity={isActive ? 1 : 0.6}
          />
        );
      })}
    </svg>
  );
}

interface MuscleDiagramProps {
  targetMuscles: MuscleGroup[];
}

/** Front/back silhouette pair with the given muscle groups highlighted. Cardio has no body region, so it's shown as a small badge instead. */
export default function MuscleDiagram({ targetMuscles }: MuscleDiagramProps) {
  const active = new Set(targetMuscles);
  const isCardio = active.has("cardio");
  const hasBodyRegions = targetMuscles.some((m) => m !== "cardio");

  return (
    <div className="muscle-diagram">
      {hasBodyRegions && (
        <>
          <Silhouette regions={FRONT_REGIONS} active={active} label="Front muscles worked" />
          <Silhouette regions={BACK_REGIONS} active={active} label="Back muscles worked" />
        </>
      )}
      {isCardio && (
        <span className="muscle-diagram-cardio" title="Cardio">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12h4l2 6 4-14 2 8h6" />
          </svg>
        </span>
      )}
      <style>{`
        .muscle-diagram {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
        }
        .muscle-diagram-cardio {
          display: inline-flex;
        }
      `}</style>
    </div>
  );
}
