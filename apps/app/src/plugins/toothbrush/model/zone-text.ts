import type { ZoneSource } from '@smarteverything/domain';

export interface ZoneText {
  readonly live: string;
  readonly recap: string;
  readonly bars: string;
}

export const ZONE_TEXT: Readonly<Record<ZoneSource, ZoneText>> = {
  estimated: {
    live: 'Mouth map showing the zones brushed so far',
    recap: 'Zones are estimated from the timing of the routine.',
    bars: 'Zones are estimated from time, the handle sends none.',
  },
  pacer: {
    live: 'Quarter map timed by the handle’s pacer, showing the quarters brushed so far',
    recap:
      'Quarters are timed by the handle’s pacer. The brush does not report where in the mouth it is.',
    bars: 'Quarters are timed by the handle’s pacer. The brush does not report where in the mouth it is.',
  },
};
