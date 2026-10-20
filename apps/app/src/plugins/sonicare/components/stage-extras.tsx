import type { ReactNode } from 'react';
import type { IntensityProps } from '../../toothbrush/brand-ui';
import { IntensityBars } from './intensity-bars';

export function SonicareStageExtras({ intensity }: IntensityProps): ReactNode {
  return <IntensityBars intensity={intensity} />;
}
