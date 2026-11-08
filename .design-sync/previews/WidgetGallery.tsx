import type { ReactNode } from 'react';
import { GlobalTheme, Stage, WidgetGallery } from 'smarteverything-kit';
import { catalogue } from '../board-demo';
import { SEMANTIC_SIZES } from '../../apps/app/src/design/tokens';

const cell = { width: 70, height: 80, gap: 12, pad: SEMANTIC_SIZES.touch.comfortable.cardPad };
const gallery = (
  <WidgetGallery
    open
    onClose={() => undefined}
    definitions={catalogue}
    placed={[]}
    board="expanded"
    cell={cell}
    onAdd={() => undefined}
  />
);
export const Dark = (): ReactNode => <Stage theme="dark">{gallery}</Stage>;
export const Light = (): ReactNode => (
  <GlobalTheme theme="light">
    <Stage theme="light">{gallery}</Stage>
  </GlobalTheme>
);
