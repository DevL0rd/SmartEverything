import { DEFAULT_WAKE_SENSITIVITY, type WakeSensitivity } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { SegmentResult } from './keyword-spotter';

type ScoreBand = 'sure' | 'near' | 'below_near';

function decibels(level: number): number {
  return Math.round(20 * Math.log10(Math.max(level, 1e-6)));
}

export class SegmentNotes {
  private startedAt = 0;
  private loudest = 0;
  private sensitivity: WakeSensitivity = DEFAULT_WAKE_SENSITIVITY;
  private spotted: string | null = null;
  private woke = false;

  constructor(
    private readonly fields: Readonly<Record<string, string>>,
    private readonly log: Logger,
  ) {}

  started(at: number, sensitivity: WakeSensitivity): void {
    this.startedAt = at;
    this.loudest = 0;
    this.sensitivity = sensitivity;
    this.spotted = null;
    this.woke = false;
  }

  level(level: number): void {
    this.loudest = Math.max(this.loudest, level);
  }

  heard(phrase: string): void {
    this.spotted ??= phrase;
  }

  wakeStarted(): void {
    this.woke = true;
  }

  ended(at: number, result: SegmentResult): void {
    const sure = this.spotted ?? result.heard;
    const band: ScoreBand =
      sure !== null ? 'sure' : result.nearMiss !== null ? 'near' : 'below_near';
    this.log.info('wake.segment_ended', {
      ...this.fields,
      ms: at - this.startedAt,
      loudestDbfs: decibels(this.loudest),
      sensitivity: this.sensitivity,
      band,
      phrase: sure ?? result.nearMiss,
      woke: this.woke,
    });
  }
}
