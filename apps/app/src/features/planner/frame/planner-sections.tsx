import type { RailEntry } from '../../../components/page-shell/section-rail';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import type { PlannerSection } from '../model/section-routes';
import { PLANNER_SECTION_DEFS, plannerHrefOf } from './sections';

const ENTRIES: readonly RailEntry[] = PLANNER_SECTION_DEFS.map((def) => ({
  id: def.id,
  label: def.label,
  icon: def.icon,
  missing: null,
}));

export function plannerSectionsOf(active: PlannerSection): ShellSections {
  return {
    label: 'Planner sections',
    active,
    hrefOf: plannerHrefOf,
    groups: [{ title: null, entries: ENTRIES }],
  };
}
