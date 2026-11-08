import type { ComponentProps, ReactNode } from 'react';
import { Hypnogram, Stage } from 'smarteverything-kit';

const t0 = new Date(2026, 9, 13, 23, 10).getTime();
const m = 60_000;
type Segment = ComponentProps<typeof Hypnogram>['segments'][number];

const seg = (a: number, b: number, stage: Segment['stage']): Segment => ({
  start: t0 + a * m,
  end: t0 + b * m,
  stage,
});
const segments = [
  seg(0, 20, 'light'),
  seg(20, 75, 'deep'),
  seg(75, 110, 'light'),
  seg(110, 130, 'rem'),
  seg(130, 137, 'awake'),
  seg(137, 190, 'light'),
  seg(190, 250, 'deep'),
  seg(250, 300, 'rem'),
  seg(300, 420, 'light'),
  seg(420, 432, 'awake'),
];
export const Night = (): ReactNode => (
  <Stage theme="dark" width={560}>
    <Hypnogram segments={segments} label="Sleep stages last night" />
  </Stage>
);
export const Compact = (): ReactNode => (
  <Stage theme="dark" width={560}>
    <Hypnogram segments={segments} label="Sleep stages last night" compact />
  </Stage>
);
export const LightTheme = (): ReactNode => (
  <Stage theme="light" width={560}>
    <Hypnogram segments={segments} label="Sleep stages last night" />
  </Stage>
);
