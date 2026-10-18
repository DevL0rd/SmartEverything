import { Rings, Stage } from 'smarteverything-kit';

const rings = [
  { progress: 0.82, colour: 'move' as const, label: 'Move' },
  { progress: 0.55, colour: 'exercise' as const, label: 'Exercise' },
  { progress: 0.9, colour: 'stand' as const, label: 'Stand' },
];
export const Activity = () => (
  <Stage theme="dark" width={320}>
    <Rings rings={rings} size={160} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={320}>
    <Rings rings={rings} size={160} />
  </Stage>
);
