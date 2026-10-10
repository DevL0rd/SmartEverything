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

export function perSecond(current: number, previous: number | undefined, seconds: number): number {
  if (previous === undefined || seconds <= 0 || current < previous) {
    return 0;
  }
  return (current - previous) / seconds;
}

export function megabitsPerSecond(bytesPerSecond: number): number {
  return roundTo((bytesPerSecond * 8) / 1e6, 2);
}

function cpuBusyPercent(
  current: readonly number[],
  previous: readonly number[] | undefined,
): number {
  if (previous === undefined || previous.length === 0) {
    return 0;
  }
  const total = sum(current) - sum(previous);
  const idle = idleOf(current) - idleOf(previous);
  return total > 0 ? clampPercent(roundTo((100 * (total - idle)) / total, 1)) : 0;
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
    cores.push(cpuBusyPercent(current.get(name) ?? [], previous?.get(name)));
  }
  return { total: cpuBusyPercent(current.get('cpu') ?? [], previous?.get('cpu')), cores };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function idleOf(times: readonly number[]): number {
  return (times[3] ?? 0) + (times[4] ?? 0);
}
