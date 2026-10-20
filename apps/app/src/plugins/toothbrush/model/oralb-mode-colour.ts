import type { OralbMode } from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';

export const ORALB_MODE_COLOUR: Readonly<Record<OralbMode, ColourRole>> = {
  daily_clean: 'viz-blue',
  sensitive: 'viz-1',
  gum_care: 'viz-4',
  whiten: 'viz-3',
  intense: 'viz-2',
  super_sensitive: 'viz-green',
  tongue_clean: 'viz-5',
  smart_adapt: 'viz-6',
  gentle_white: 'viz-magenta',
};
