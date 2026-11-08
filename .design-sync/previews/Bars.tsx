import type { ReactElement } from 'react';
import { Bars, Stage } from 'smarteverything-kit';

const dailyActivity = [
  { label: 'Mon', steps: 6200, energy: 4.2 },
  { label: 'Tue', steps: 8400, energy: 5.1 },
  { label: 'Wed', steps: 10300, energy: 3.8 },
  { label: 'Thu', steps: 7100, energy: 6.4 },
  { label: 'Fri', steps: 9800, energy: 5.9 },
  { label: 'Sat', steps: 12400, energy: 7.2 },
  { label: 'Sun', steps: 5600, energy: 4.4 },
];
const steps = dailyActivity.map(({ label, steps }, index) => ({
  key: `d${String(index)}`,
  value: steps,
  label,
}));
const energy = dailyActivity.map(({ label, energy }, index) => ({
  key: `e${String(index)}`,
  value: energy,
  label,
}));
export const Weekly = (): ReactElement => (
  <Stage theme="dark" width={480}>
    <Bars
      bars={steps}
      colour="move"
      label="Steps per day"
      height={160}
      highlightKey="d2"
      formatValue={(v) => `${v.toLocaleString('en-US')} steps`}
    />
  </Stage>
);
export const Energy = (): ReactElement => (
  <Stage theme="dark" width={480}>
    <Bars
      bars={energy}
      colour="viz-1"
      label="Energy per day"
      height={140}
      formatValue={(v) => `${String(v)} kWh`}
    />
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={480}>
    <Bars bars={steps} colour="move" label="Steps per day" height={160} highlightKey="d2" />
  </Stage>
);
