import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import type { IconName } from '../../../components/icon';
import type { ClockSection } from '../model/section-routes';

export interface ClockSectionDef {
  readonly id: ClockSection;
  readonly label: string;
  readonly icon: IconName;
  readonly href: AppHref;
  readonly hint: string;
  readonly offline: string;
}

export const CLOCK_QUICK_ADD_TARGET = 'clock' as const;

export const CLOCK_SECTION_DEFS: readonly ClockSectionDef[] = [
  {
    id: 'index',
    label: 'Alarms',
    icon: 'alarmClock',
    href: href.clock.alarms(),
    hint: 'New alarm. Try: wake me 06:30 weekdays',
    offline:
      'You can change alarms again when the hub is back. Alarms set on this phone still ring.',
  },
  {
    id: 'bedtime',
    label: 'Bedtime',
    icon: 'moon',
    href: href.clock.bedtime(),
    hint: 'New alarm. Try: wake me 06:30 weekdays',
    offline: 'Bedtime changes wait for the hub. Alarms set on this phone still ring.',
  },
  {
    id: 'timers',
    label: 'Timers',
    icon: 'timer',
    href: href.clock.timers(),
    hint: 'New timer. Try: pasta 10 min',
    offline: 'Changes wait for the hub. Alarms set on this phone still ring.',
  },
  {
    id: 'stopwatch',
    label: 'Stopwatch',
    icon: 'clock',
    href: href.clock.stopwatch(),
    hint: 'New alarm or timer. Try: tea 4 min',
    offline: 'Changes wait for the hub. Alarms set on this phone still ring.',
  },
  {
    id: 'world',
    label: 'World clock',
    icon: 'globe',
    href: href.clock.world(),
    hint: 'New alarm or timer. Try: wake me 06:30 weekdays',
    offline: 'World clock changes wait for the hub. Alarms set on this phone still ring.',
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
