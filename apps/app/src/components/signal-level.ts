import { signed } from '../format/number';

export type SignalQuality = 'good' | 'fair' | 'weak';

export interface Signal {
  readonly bars: 0 | 1 | 2 | 3 | 4;
  readonly quality: SignalQuality;
  readonly label: string;
}

const BARS_AT = [
  [-55, 4],
  [-67, 3],
  [-75, 2],
  [-85, 1],
] as const;

function barsOf(dbm: number): Signal['bars'] {
  const found = BARS_AT.find(([floor]) => dbm >= floor);
  return found === undefined ? 0 : found[1];
}

function qualityOf(bars: Signal['bars']): SignalQuality {
  if (bars >= 3) {
    return 'good';
  }
  return bars === 2 ? 'fair' : 'weak';
}

export function signalOf(dbm: number | null): Signal {
  if (dbm === null) {
    return { bars: 0, quality: 'weak', label: 'No signal reading' };
  }
  const bars = barsOf(dbm);
  const quality = qualityOf(bars);
  return { bars, quality, label: `Signal ${quality}, ${signed(dbm)} dBm` };
}
