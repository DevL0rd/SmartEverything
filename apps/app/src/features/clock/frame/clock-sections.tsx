import type { RailEntry } from '../../../components/page-shell/section-rail';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import type { ClockSection } from '../model/section-routes';
import { CLOCK_SECTION_DEFS, clockHrefOf } from './sections';

const ENTRIES: readonly RailEntry[] = CLOCK_SECTION_DEFS.map((def) => ({
  id: def.id,
  label: def.label,
  icon: def.icon,
  missing: null,
}));

export function clockSectionsOf(active: ClockSection): ShellSections {
  return {
    label: 'Clock sections',
    active,
    hrefOf: clockHrefOf,
    groups: [{ title: null, entries: ENTRIES }],
  };
}
