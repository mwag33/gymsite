// Multi-category focus display, for surfaces with room for more than one
// glyph (TodayHero, DayDetailPage tracked card, SessionTrackerPage header).
// MonthAgenda's 34px cells stay single-icon - see deriveFocus.ts for the
// underlying derivation, this is just the rendering. No <style> of its own -
// same convention as SetEditor/MachinePicker (see SessionTrackerPage's file
// comment): this component renders inside .map() loops (TodayHero's stacked
// sessions, DayDetailPage's tracked cards), so shipping its own <style> tag
// would duplicate identical CSS once per list item. Each mounting page
// includes the `.focus-tags*` rules once in its own style block instead.
import type { MachineCategory, MuscleGroup } from "../../lib/types";
import { MACHINE_CATEGORIES } from "../../lib/types";
import { FocusIcon } from "./focusIcons";
import { MUSCLE_GROUP_LABELS } from "./deriveFocus";

export function categoryLabel(c: MachineCategory): string {
  return MACHINE_CATEGORIES.find((m) => m.value === c)?.label ?? c;
}

interface FocusTagsProps {
  categories: MachineCategory[];
  muscles?: MuscleGroup[];
  iconSize?: number;
  fallbackLabel?: string;
}

export function FocusTags({ categories, muscles = [], iconSize = 20, fallbackLabel = "New session" }: FocusTagsProps) {
  if (categories.length === 0) {
    return <span className="focus-tags focus-tags-empty">{fallbackLabel}</span>;
  }
  return (
    <span className="focus-tags-wrap">
      <span className="focus-tags">
        {categories.map((c, i) => (
          <span key={c} className="focus-tags-item">
            <FocusIcon focus={c} width={iconSize} height={iconSize} />
            {categoryLabel(c)}
            {i < categories.length - 1 && <span className="focus-tags-sep">+</span>}
          </span>
        ))}
      </span>
      {muscles.length > 0 && (
        <span className="focus-tags-muscles">{muscles.map((m) => MUSCLE_GROUP_LABELS[m]).join(", ")}</span>
      )}
    </span>
  );
}

/** Shared CSS for <FocusTags>, meant to be interpolated into the mounting
 * page's own <style> block (see the file comment above for why). */
export const FOCUS_TAGS_STYLES = `
  .focus-tags-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .focus-tags,
  .focus-tags-empty {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .focus-tags-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .focus-tags-sep {
    margin-left: var(--space-2);
    color: var(--text-muted);
  }
  .focus-tags-muscles {
    font-size: 12px;
    color: var(--text-muted);
  }
`;
