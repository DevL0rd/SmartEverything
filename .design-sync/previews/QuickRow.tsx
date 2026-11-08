import type { ReactNode } from 'react';
import { QuickRow, Stage } from 'smarteverything-kit';

const close = (): void => undefined;
const items = [
  { label: 'Pin', icon: 'sparkles' as const, onPress: close },
  { label: 'Share', icon: 'upload' as const, onPress: close },
  { label: 'Copy', icon: 'grid' as const, onPress: close },
];
export const Actions = (): ReactNode => (
  <Stage theme="dark" width={360}>
    <QuickRow items={items} close={close} subpages={false} />
  </Stage>
);
export const LightTheme = (): ReactNode => (
  <Stage theme="light" width={360}>
    <QuickRow items={items} close={close} subpages={false} />
  </Stage>
);
