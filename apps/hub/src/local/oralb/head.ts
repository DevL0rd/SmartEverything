import { oralbHeadWear, type OralbHeadBaseline } from '@smarteverything/domain';
import type { BrandEvent } from '../toothbrush/brand';
import type { HeadReading } from './state';

const DAY_JUMP = 1;

const SECOND_JUMP = 60;

const REMINDER_ON = 0;

interface HeadThresholds {
  readonly warnDays: number;
  readonly dueDays: number;
}

interface HeadUpdate {
  readonly baseline: OralbHeadBaseline | null;
  readonly changed: boolean;
  readonly last: Pick<HeadReading, 'days' | 'seconds'>;
  readonly moved: boolean;
}

export function isReset(
  previous: Pick<HeadReading, 'days' | 'seconds'>,
  next: HeadReading,
): boolean {
  return next.days > previous.days + DAY_JUMP || next.seconds > previous.seconds + SECOND_JUMP;
}

export class HeadTracker {
  private last: Pick<HeadReading, 'days' | 'seconds'> | null;
  private readonly notified = new Set<string>();
  private pending: BrandEvent[] = [];

  constructor(
    public baseline: OralbHeadBaseline | null,
    last: Pick<HeadReading, 'days' | 'seconds'> | null = null,
  ) {
    this.last = last;
  }

  update(reading: HeadReading, at: string, thresholds: HeadThresholds): HeadUpdate {
    const previous = this.last ?? this.baseline;
    const moved = previous?.days !== reading.days;
    this.last = { days: reading.days, seconds: reading.seconds };
    const fresh = previous === null || isReset(previous, reading);
    if (fresh) {
      this.baseline = { days: reading.days, seconds: reading.seconds, at };
      this.notified.clear();
      if (previous !== null) {
        this.queue('replaced', { daysLeft: reading.days }, at, `head:replaced:${at}`);
      }
    }
    this.crossings(reading, at, thresholds);
    return { baseline: this.baseline, changed: fresh, last: this.last, moved: moved || fresh };
  }

  wear(reading: HeadReading): number | null {
    return oralbHeadWear(reading.days, reading.seconds, this.baseline);
  }

  drain(): BrandEvent[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }

  private crossings(reading: HeadReading, at: string, thresholds: HeadThresholds): void {
    if (reading.state !== REMINDER_ON) {
      return;
    }
    const levels = [
      ['warn', thresholds.warnDays],
      ['due', thresholds.dueDays],
    ] as const;
    for (const [level, days] of levels) {
      const key = `${this.baseline?.at ?? at}:${level}`;
      if (reading.days <= days && !this.notified.has(key)) {
        this.notified.add(key);
        this.queue(level, { daysLeft: reading.days }, at, `head:${key}`);
      }
    }
  }

  private queue(
    level: 'warn' | 'due' | 'replaced',
    details: { readonly daysLeft: number },
    at: string,
    occurrence: string,
  ): void {
    this.pending.push({
      kind: 'maintenance',
      at,
      details: { brushHead: level, ...details },
      occurrence,
    });
  }
}
