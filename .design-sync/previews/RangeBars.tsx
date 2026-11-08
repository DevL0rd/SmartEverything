import type { ReactElement } from 'react';
import { RangeBars, Stage } from 'smarteverything-kit';

const buckets = [
  { key: 'Mon', min: 18.4, max: 23.1 },
  { key: 'Tue', min: 17.9, max: 22.6 },
  { key: 'Wed', min: 19.2, max: 24.8 },
  { key: 'Thu', min: 18.1, max: 21.9 },
  { key: 'Fri', min: 17.4, max: 22.2 },
  { key: 'Sat', min: 18.8, max: 25.0 },
  { key: 'Sun', min: 18.0, max: 23.4 },
];
export const Temperature = (): ReactElement => (
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
export const LightTheme = (): ReactElement => (
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
