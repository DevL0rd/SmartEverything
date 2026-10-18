import { cpuBusyPercent } from '@smarteverything/domain';

export function numberOf(text: string | undefined): number | null {
  if (text === undefined || text.trim().length === 0) {
    return null;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function percentOf(part: number, whole: number): number {
  return whole > 0 ? clampPercent(roundTo((100 * part) / whole, 1)) : 0;
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function megabitsPerSecond(bytesPerSecond: number): number {
  return roundTo((bytesPerSecond * 8) / 1e6, 2);
}

interface CpuPercents {
  readonly total: number;
  readonly cores: readonly number[];
}

export function cpuPercents(
  current: ReadonlyMap<string, readonly number[]>,
  previous: ReadonlyMap<string, readonly number[]> | null,
): CpuPercents {
  const cores: number[] = [];
  for (let index = 0; current.has(`cpu${String(index)}`); index += 1) {
    const name = `cpu${String(index)}`;
    cores.push(busyPercent(current.get(name), previous?.get(name)));
  }
  return { total: busyPercent(current.get('cpu'), previous?.get('cpu')), cores };
}

function busyPercent(
  current: readonly number[] | undefined,
  previous: readonly number[] | undefined,
): number {
  return roundTo(cpuBusyPercent(current ?? [], previous), 1);
}
