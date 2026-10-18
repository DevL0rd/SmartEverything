import { SkeletonBoard, Stage } from 'smarteverything-kit';

const widgets = [
  { key: 'a', type: 'climate', size: 'M' as const },
  { key: 'b', type: 'security', size: 'S' as const },
  { key: 'c', type: 'energy', size: 'S' as const },
  { key: 'd', type: 'health', size: 'W' as const },
];
export const Loading = () => (
  <Stage theme="dark" width={760}>
    <SkeletonBoard board="expanded" widgets={widgets} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={760}>
    <SkeletonBoard board="expanded" widgets={widgets} />
  </Stage>
);
