import type { Logger } from '@smarteverything/logging';

function decibels(level: number): number {
  return Math.round(20 * Math.log10(Math.max(level, 1e-6)));
}

export class SegmentNotes {
  private startedAt = 0;
  private loudest = 0;

  constructor(
    private readonly cameraId: string,
    private readonly log: Logger,
  ) {}

  started(at: number): void {
    this.startedAt = at;
    this.loudest = 0;
  }

  level(level: number): void {
    this.loudest = Math.max(this.loudest, level);
  }

  ended(at: number, nearMiss: string | null, threshold: number): void {
    const segment = {
      cameraId: this.cameraId,
      ms: at - this.startedAt,
      loudestDbfs: decibels(this.loudest),
    };
    this.log.debug('wake.segment', segment);
    if (nearMiss !== null) {
      this.log.info('wake.near_miss', { ...segment, phrase: nearMiss, belowThreshold: threshold });
    }
  }
}
