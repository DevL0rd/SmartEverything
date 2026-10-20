import type { SonicareMode } from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';

export const MODE_COLOUR: Readonly<Record<SonicareMode, ColourRole>> = {
  clean: 'viz-blue',
  white_plus: 'viz-3',
  gum_health: 'viz-4',
  tongue_care: 'viz-5',
  deep_clean_plus: 'viz-1',
  sensitive: 'viz-magenta',
};
