// Shared by PlanReveal and PlanEditor to label a plan day by weekday.
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// The plan's `weekStart` Firestore Timestamp isn't strongly typed on the
// client (TrainingPlan.weekStart: unknown), so duck-type it rather than
// import the admin/client Timestamp class here.
export function toDate(value: unknown): Date | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

export function dayLabel(weekStart: unknown, dayIndex: number): string {
  const start = toDate(weekStart);
  if (!start) return `Day ${dayIndex + 1}`;
  const weekday = (start.getDay() + dayIndex) % 7;
  return WEEKDAY_NAMES[weekday];
}
