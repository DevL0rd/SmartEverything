import type { ReactElement } from 'react';
import { DayAxis, Stage } from 'smarteverything-kit';

const days = [
  '2026-10-12',
  '2026-10-13',
  '2026-10-14',
  '2026-10-15',
  '2026-10-16',
  '2026-10-17',
  '2026-10-18',
];
export const Week = (): ReactElement => (
  <Stage theme="dark" width={420}>
    <DayAxis days={days} />
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={420}>
    <DayAxis days={days} />
  </Stage>
);
