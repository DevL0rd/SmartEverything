import { Stage, StageTimeline } from 'smarteverything-kit';

const t0 = new Date(2026, 9, 13, 23, 10).getTime();
const m = 60_000;
const seg = (a: number, b: number, stage: 'deep' | 'core' | 'rem' | 'awake') => ({
  start: t0 + a * m,
  end: t0 + b * m,
  stage,
});
const segments = [
  seg(0, 20, 'core'),
  seg(20, 75, 'deep'),
  seg(75, 110, 'core'),
  seg(110, 130, 'rem'),
  seg(130, 137, 'awake'),
  seg(137, 190, 'core'),
  seg(190, 250, 'deep'),
  seg(250, 300, 'rem'),
  seg(300, 420, 'core'),
  seg(420, 432, 'awake'),
];
export const Night = () => (
  <Stage theme="dark" width={560}>
    <StageTimeline segments={segments} label="Sleep stages last night" />
  </Stage>
);
export const Compact = () => (
  <Stage theme="dark" width={560}>
    <StageTimeline segments={segments} label="Sleep stages last night" compact />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={560}>
    <StageTimeline segments={segments} label="Sleep stages last night" />
  </Stage>
);
