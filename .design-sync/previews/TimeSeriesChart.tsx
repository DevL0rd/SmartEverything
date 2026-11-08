import type { ReactElement } from 'react';
import { Stage, TimeSeriesChart } from 'smarteverything-kit';

const HOUR = 3_600_000;
const start = new Date(2026, 9, 14, 0, 0).getTime();
const temp = Array.from({ length: 25 }, (_, i) => ({
  t: start + i * HOUR,
  v: 19.5 + 2.2 * Math.sin(((i - 6) / 24) * Math.PI * 2) + (i % 3) * 0.1,
}));
const humid = Array.from({ length: 25 }, (_, i) => ({
  t: start + i * HOUR,
  v: 46 + 6 * Math.cos(((i - 4) / 24) * Math.PI * 2),
}));
const days = [6.8, 7.4, 5.9, 8.1, 6.3, 7.7, 6.2].map((value, i) => ({
  t: start - (6 - i) * 24 * HOUR,
  v: value,
}));

export const Day = (): ReactElement => (
  <Stage theme="dark" width={560}>
    <TimeSeriesChart
      range="24h"
      unit="C"
      height={200}
      series={[{ label: 'Living room', colour: 'viz-2', points: temp }]}
    />
  </Stage>
);
export const TwoSeries = (): ReactElement => (
  <Stage theme="dark" width={560}>
    <TimeSeriesChart
      range="24h"
      height={220}
      series={[
        { label: 'Temperature (C)', colour: 'viz-2', points: temp },
        { label: 'Humidity (%)', colour: 'viz-1', points: humid },
      ]}
      marker={{ at: start + 14 * HOUR, label: 'Heater on' }}
    />
  </Stage>
);
export const Week = (): ReactElement => (
  <Stage theme="dark" width={560}>
    <TimeSeriesChart
      range="7d"
      unit="kWh"
      height={200}
      series={[{ label: 'Energy', colour: 'viz-3', points: days }]}
    />
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={560}>
    <TimeSeriesChart
      range="24h"
      unit="C"
      height={200}
      series={[{ label: 'Living room', colour: 'viz-2', points: temp }]}
    />
  </Stage>
);
