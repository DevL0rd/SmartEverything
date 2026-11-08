import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { frameLayoutMath } from '../../../components/frame-layout';
import type { IconName } from '../../../components/icon';
import type { ClockSection } from '../model/section-routes';

export interface ClockSectionDef {
  readonly id: ClockSection;
  readonly label: string;
  readonly short: string;
  readonly icon: IconName;
  readonly href: AppHref;
  readonly hint: string;
}

export const CLOCK_QUICK_ADD_TARGET = 'clock' as const;

export const CLOCK_SECTION_DEFS: readonly ClockSectionDef[] = [
  {
    id: 'index',
    label: 'Alarms',
    short: 'Alarms',
    icon: 'alarmClock',
    href: href.clock.alarms(),
    hint: 'New alarm. Try: wake me 06:30 weekdays',
  },
  {
    id: 'timers',
    label: 'Timers',
    short: 'Timers',
    icon: 'timer',
    href: href.clock.timers(),
    hint: 'New timer. Try: pasta 10 min',
  },
  {
    id: 'stopwatch',
    label: 'Stopwatch',
    short: 'Stopwatch',
    icon: 'clock',
    href: href.clock.stopwatch(),
    hint: 'New alarm or timer. Try: tea 4 min',
  },
  {
    id: 'world',
    label: 'World clock',
    short: 'World',
    icon: 'globe',
    href: href.clock.world(),
    hint: 'New alarm or timer. Try: wake me 06:30 weekdays',
  },
];

class UnknownClockSection extends Error {
  constructor(section: string) {
    super(`The Clock has no section ${section}.`);
  }
}

export function clockSectionOf(section: ClockSection): ClockSectionDef {
  const def = CLOCK_SECTION_DEFS.find((entry) => entry.id === section);
  if (def === undefined) throw new UnknownClockSection(section);
  return def;
}

export function isClockSection(id: string): id is ClockSection {
  return CLOCK_SECTION_DEFS.some((entry) => entry.id === id);
}

export function clockHrefOf(id: string): AppHref {
  if (!isClockSection(id)) throw new UnknownClockSection(id);
  return clockSectionOf(id).href;
}

export const { frameLayoutOf, railWidthOf } = frameLayoutMath({
  compactMax: 600,
  iconRailMax: 900,
  wideRailMin: 1024,
});

export function clockTitleOf(section: ClockSection, area: number): string {
  return frameLayoutOf(area) === 'wide' ? clockSectionOf(section).label : 'Clock';
}
