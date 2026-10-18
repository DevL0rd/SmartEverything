import { Bars, Stage } from 'smarteverything-kit';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const steps = [6200, 8400, 10300, 7100, 9800, 12400, 5600].map((v, i) => ({
  key: `d${i}`,
  value: v,
  label: days[i]!,
}));
export const Weekly = () => (
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
export const Energy = () => (
  <Stage theme="dark" width={480}>
    <Bars
      bars={[4.2, 5.1, 3.8, 6.4, 5.9, 7.2, 4.4].map((v, i) => ({
        key: `e${i}`,
        value: v,
        label: days[i]!,
      }))}
      colour="viz-1"
      label="Energy per day"
      height={140}
      formatValue={(v) => `${v} kWh`}
    />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    <Bars bars={steps} colour="move" label="Steps per day" height={160} highlightKey="d2" />
  </Stage>
);
