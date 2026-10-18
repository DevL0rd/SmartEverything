import { RangeBars, Stage } from 'smarteverything-kit';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const buckets = [
  [18.4, 23.1],
  [17.9, 22.6],
  [19.2, 24.8],
  [18.1, 21.9],
  [17.4, 22.2],
  [18.8, 25.0],
  [18.0, 23.4],
].map(([min, max], i) => ({ key: days[i]!, min: min!, max: max! }));
export const Temperature = () => (
  <Stage theme="dark" width={480}>
    <RangeBars
      buckets={buckets}
      colour="temp-warm"
      label="Daily temperature range"
      height={170}
      formatValue={(v) => v.toFixed(0)}
    />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    <RangeBars
      buckets={buckets}
      colour="temp-cool"
      label="Daily temperature range"
      height={170}
      formatValue={(v) => v.toFixed(0)}
    />
  </Stage>
);
