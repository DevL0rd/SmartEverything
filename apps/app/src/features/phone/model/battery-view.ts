import type { PhoneDetail } from '@smarteverything/domain';
import type { GaugeBand } from '../../../components/charts';

type Power = NonNullable<PhoneDetail['power']>;

const MICRO = 1_000_000;
const WATT_DIGITS = 1;
const BYTES_PER_GB = 1024 ** 3;

const COOL_MAX = 35;
const WARM_MAX = 42;
const HOT_MAX = 60;

export const TEMPERATURE_BANDS: readonly GaugeBand[] = [
  { upTo: COOL_MAX, colour: 'positive' },
  { upTo: WARM_MAX, colour: 'warning' },
  { upTo: HOT_MAX, colour: 'critical' },
];

export const TEMPERATURE_RANGE = { min: 0, max: HOT_MAX } as const;

const HEALTH_TEXT: Readonly<Record<Power['health'], string>> = {
  good: 'Good',
  overheat: 'Overheated',
  dead: 'Needs replacing',
  over_voltage: 'Over voltage',
  failure: 'Failing',
  cold: 'Too cold',
  unknown: 'Not reported',
};

const CHARGER_TEXT: Readonly<Record<Power['charger'], string>> = {
  none: 'On battery',
  ac: 'Wall charger',
  usb: 'USB',
  wireless: 'Wireless charger',
  dock: 'Dock',
};

export function healthText(health: Power['health']): string {
  return HEALTH_TEXT[health];
}

export function chargerText(charger: Power['charger']): string {
  return CHARGER_TEXT[charger];
}

export function rateText(power: Power | undefined, charging: boolean): string | null {
  const current = power?.currentMa ?? null;
  const voltage = power?.voltageMv ?? null;
  if (current === null || voltage === null) return null;
  const watts = (Math.abs(current) * voltage) / MICRO;
  const figure = watts.toFixed(WATT_DIGITS);
  return charging ? `Charging at ${figure} W` : `Using ${figure} W`;
}

export function temperatureWord(celsius: number): string {
  if (celsius <= COOL_MAX) return 'Cool';
  return celsius <= WARM_MAX ? 'Warm' : 'Hot';
}

export interface MemoryView {
  readonly totalGb: number;
  readonly usedGb: number;
}

export function memoryOf(power: Power): MemoryView {
  const { totalBytes, availableBytes } = power.memory;
  const usedBytes = Math.max(0, totalBytes - availableBytes);
  return {
    totalGb: totalBytes / BYTES_PER_GB,
    usedGb: usedBytes / BYTES_PER_GB,
  };
}
