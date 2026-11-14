import type { ComposerKind } from '../../planner/item/parse-preview';
import type { ClockSection } from '../model/section-routes';

const CLOCK_SECTION_KIND: Readonly<Record<ClockSection, ComposerKind>> = {
  index: 'alarm',
  timers: 'timer',
  stopwatch: 'timer',
  world: 'alarm',
};

export function clockComposerKindOf(section: ClockSection): ComposerKind {
  return CLOCK_SECTION_KIND[section];
}
