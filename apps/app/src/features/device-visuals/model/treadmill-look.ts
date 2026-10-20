import type { SpeedZone } from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';

export const TREADMILL_ZONE_COLOUR: Readonly<Record<SpeedZone, ColourRole>> = {
  walk: 'positive',
  jog: 'caution',
  run: 'viz-magenta',
};
