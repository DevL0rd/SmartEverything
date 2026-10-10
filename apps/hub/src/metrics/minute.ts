export const MINUTE_MS = 60_000;

export const HOUR_MS = 3_600_000;

export interface MinuteSummary {
  readonly start: number;
  readonly average: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly count: number;
}

interface Running {
  readonly start: number;
  sum: number;
  count: number;
  minimum: number;
  maximum: number;
}

export function startOf(at: number, size: number): number {
  return Math.floor(at / size) * size;
}

export class MinuteAccumulator {
  private running: Running | null = null;

  add(value: number, at: number): MinuteSummary | null {
    const start = startOf(at, MINUTE_MS);
    const running = this.running;
    if (running !== null && running.start === start) {
      running.sum += value;
      running.count += 1;
      running.minimum = Math.min(running.minimum, value);
      running.maximum = Math.max(running.maximum, value);
      return null;
    }
    this.running = { start, sum: value, count: 1, minimum: value, maximum: value };
    return running === null ? null : summaryOf(running);
  }
}

function summaryOf(running: Running): MinuteSummary {
  return {
    start: running.start,
    average: running.sum / running.count,
    minimum: running.minimum,
    maximum: running.maximum,
    count: running.count,
  };
}
