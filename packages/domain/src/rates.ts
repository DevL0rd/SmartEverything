const BUSY_FIELDS = 8;
const IDLE_FIELD = 3;
const IOWAIT_FIELD = 4;

export function perSecond(current: number, previous: number | undefined, seconds: number): number {
  if (previous === undefined || seconds <= 0 || current < previous) {
    return 0;
  }
  return (current - previous) / seconds;
}

export function cpuBusyPercent(
  current: readonly number[],
  previous: readonly number[] | undefined,
): number {
  if (previous === undefined) {
    return 0;
  }
  const total = timeIn(current) - timeIn(previous);
  const idle = idleIn(current) - idleIn(previous);
  return total > 0 ? Math.min(100, Math.max(0, (100 * (total - idle)) / total)) : 0;
}

function timeIn(times: readonly number[]): number {
  return times.slice(0, BUSY_FIELDS).reduce((sum, value) => sum + value, 0);
}

function idleIn(times: readonly number[]): number {
  return (times[IDLE_FIELD] ?? 0) + (times[IOWAIT_FIELD] ?? 0);
}
