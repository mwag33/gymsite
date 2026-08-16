// Curated starter list of the ~20 most common commercial-gym machines, used
// to seed a gym's machine list quickly and to enrich display (icon + muscle
// diagram) for any machine whose name matches. This is display/seed metadata
// only - it never becomes part of the shared `Machine` Firestore doc shape
// (name + category only, see firestore.rules `isValidNewMachine`), so a
// catalog change here never needs a rules or backend change.
import type { MachineCategory, MuscleGroup } from "./types";

export interface CatalogMachine {
  id: string;
  name: string;
  category: MachineCategory;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  // Optional photo (user-supplied, frontend/public/machine-gallery/) shown
  // instead of the MachineIcon SVG pictogram when present. Named for the
  // exercise, not a brand/model - see machine_gallery/ at the repo root for
  // the source files.
  image?: string;
}

const GALLERY = "/machine-gallery";

export const MACHINE_CATALOG: CatalogMachine[] = [
  { id: "leg-press", name: "Leg Press", category: "legs", primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings"], image: `${GALLERY}/legpress.png` },
  { id: "squat-rack", name: "Squat Rack", category: "legs", primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings", "abs"] },
  { id: "leg-extension", name: "Leg Extension", category: "legs", primaryMuscles: ["quads"], secondaryMuscles: [] },
  { id: "leg-curl", name: "Leg Curl", category: "legs", primaryMuscles: ["hamstrings"], secondaryMuscles: ["calves"], image: `${GALLERY}/legcurl.png` },
  { id: "hip-abductor-adductor", name: "Hip Abductor/Adductor Machine", category: "legs", primaryMuscles: ["glutes"], secondaryMuscles: ["quads"] },
  { id: "smith-machine", name: "Smith Machine", category: "legs", primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["chest", "shoulders"] },
  { id: "lat-pulldown", name: "Lat Pulldown", category: "back", primaryMuscles: ["lats"], secondaryMuscles: ["biceps", "upper_back"], image: `${GALLERY}/latpulldown.png` },
  { id: "seated-cable-row", name: "Seated Cable Row", category: "back", primaryMuscles: ["upper_back", "lats"], secondaryMuscles: ["biceps"], image: `${GALLERY}/cablerow.png` },
  { id: "assisted-pullup-dip", name: "Assisted Pull-up/Dip Machine", category: "back", primaryMuscles: ["lats", "triceps"], secondaryMuscles: ["chest", "biceps"] },
  { id: "chest-press", name: "Chest Press Machine", category: "chest", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"] },
  { id: "pec-deck", name: "Pec Deck / Chest Fly Machine", category: "chest", primaryMuscles: ["chest"], secondaryMuscles: ["shoulders"] },
  { id: "cable-crossover", name: "Cable Crossover", category: "chest", primaryMuscles: ["chest"], secondaryMuscles: ["shoulders"] },
  { id: "shoulder-press", name: "Shoulder Press Machine", category: "upper_body", primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps"] },
  { id: "cable-tricep-pushdown", name: "Cable Tricep Pushdown", category: "upper_body", primaryMuscles: ["triceps"], secondaryMuscles: [] },
  { id: "preacher-curl", name: "Preacher Curl Machine", category: "upper_body", primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"] },
  { id: "ab-crunch-machine", name: "Ab Crunch Machine", category: "core", primaryMuscles: ["abs"], secondaryMuscles: ["obliques"], image: `${GALLERY}/abcrunch.png` },
  { id: "treadmill", name: "Treadmill", category: "cardio", primaryMuscles: ["cardio"], secondaryMuscles: ["quads", "calves"], image: `${GALLERY}/treadmill.png` },
  { id: "stationary-bike", name: "Stationary Bike", category: "cardio", primaryMuscles: ["cardio"], secondaryMuscles: ["quads"], image: `${GALLERY}/bike.png` },
  { id: "rowing-machine", name: "Rowing Machine", category: "cardio", primaryMuscles: ["cardio", "upper_back"], secondaryMuscles: ["lats", "quads"], image: `${GALLERY}/stationaryrow.png` },
  { id: "elliptical", name: "Elliptical", category: "cardio", primaryMuscles: ["cardio"], secondaryMuscles: ["quads", "glutes"], image: `${GALLERY}/elliptical.png` },
  { id: "recumbent-bike", name: "Recumbent Bike", category: "cardio", primaryMuscles: ["cardio"], secondaryMuscles: ["quads"], image: `${GALLERY}/recumbmentbike.png` },
  { id: "stair-stepper", name: "Stair Stepper", category: "cardio", primaryMuscles: ["cardio"], secondaryMuscles: ["quads", "glutes"], image: `${GALLERY}/stepper.png` },
  { id: "barbell-squat", name: "Barbell Squat", category: "legs", primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings", "abs"], image: `${GALLERY}/barbell.png` },
  { id: "barbell-bench-press", name: "Barbell Bench Press", category: "chest", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"], image: `${GALLERY}/bench.png` },
  { id: "dumbbell-shoulder-press", name: "Dumbbell Shoulder Press", category: "upper_body", primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps"], image: `${GALLERY}/dumbbell.png` },
  { id: "kettlebell-swing", name: "Kettlebell Swing", category: "core", primaryMuscles: ["glutes", "abs"], secondaryMuscles: ["hamstrings", "shoulders"], image: `${GALLERY}/kettlebell.png` },
  { id: "tricep-dips", name: "Tricep Dips", category: "upper_body", primaryMuscles: ["triceps"], secondaryMuscles: ["chest", "shoulders"], image: `${GALLERY}/dippingbar.png` },
  { id: "chest-dips", name: "Chest Dips", category: "chest", primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"], image: `${GALLERY}/parallelbar.png` },
];

/** Case-insensitive lookup used to enrich any machine name (catalog-sourced or freeform) with icon/muscle data. */
export function findCatalogMachine(name: string): CatalogMachine | undefined {
  const normalized = name.trim().toLowerCase();
  return MACHINE_CATALOG.find((m) => m.name.toLowerCase() === normalized);
}
