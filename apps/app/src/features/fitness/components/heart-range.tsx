import type { ReactNode } from 'react';
import { ProgressBar } from '../../../components/charts';

const FLOOR = 40;
const CEILING = 190;

function share(value: number): number {
  return (value - FLOOR) / (CEILING - FLOOR);
}

export function HeartRange({
  low,
  high,
  resting,
}: {
  readonly low: number;
  readonly high: number;
  readonly resting: number | null;
}): ReactNode {
  return (
    <ProgressBar
      from={share(low)}
      progress={share(high)}
      marker={resting === null ? null : share(resting)}
      colour="heart"
      label={`Heart rate from ${String(Math.round(low))} to ${String(Math.round(high))} bpm`}
    />
  );
}
