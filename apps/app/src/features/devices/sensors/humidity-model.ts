import type { PowerState } from '../model/device-model';

const FULL_TURN = 360;
const TICK_SWEEP = 5;

export function humidityShare(percentage: number): number {
  return Math.min(1, Math.max(0, percentage / 100));
}

export function targetTick(target: number): { readonly start: number; readonly sweep: number } {
  return { start: humidityShare(target) * FULL_TURN - TICK_SWEEP / 2, sweep: TICK_SWEEP };
}

function waitingText(power: PowerState): string {
  switch (power) {
    case 'off':
      return 'Off';
    case 'offline':
      return 'No reading yet';
    case 'on':
    case 'unknown':
    case 'none':
      return 'Waiting for the first reading';
  }
}

export function humidityStateText(
  humidity: number | null,
  target: number | null,
  power: PowerState,
): string {
  if (humidity === null) {
    return waitingText(power);
  }
  const reading = `${String(Math.round(humidity))} % humidity`;
  if (power === 'off') {
    return `Off · ${reading}`;
  }
  return target === null || power !== 'on'
    ? reading
    : `${reading} · target ${String(Math.round(target))} %`;
}
