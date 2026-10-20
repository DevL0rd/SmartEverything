import type { ReactNode } from 'react';
import type { VisualProps } from '../types';
import { OralbVisual } from './oralb-visual';
import { SonicareVisual } from './sonicare-visual';

export function ToothbrushVisual(props: VisualProps): ReactNode {
  return props.state.toothbrush?.brand === 'oralb' ? (
    <OralbVisual {...props} />
  ) : (
    <SonicareVisual {...props} />
  );
}
