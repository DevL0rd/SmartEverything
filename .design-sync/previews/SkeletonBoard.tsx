import type { ReactNode } from 'react';
import { SkeletonBoard, Stage } from 'smarteverything-kit';

const widgets = [
  { key: 'a', type: 'climate', size: 'M' as const },
  { key: 'b', type: 'security', size: 'M' as const },
  { key: 'c', type: 'energy', size: 'M' as const },
  { key: 'd', type: 'health', size: 'W' as const },
];
export const Loading = (): ReactNode => (
  <Stage theme="dark" width={760}>
    <SkeletonBoard board="expanded" widgets={widgets} />
  </Stage>
);
export const LightTheme = (): ReactNode => (
  <Stage theme="light" width={760}>
    <SkeletonBoard board="expanded" widgets={widgets} />
  </Stage>
);
