import { rm } from 'node:fs/promises';
import type { RecordingRow } from '@smarteverything/domain';
import { background, messageOf, type Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import { MINUTE_MS } from '../metrics/minute';
import type { Store } from '../store/store';
import { thumbnailPathOf } from './thumbnails';

export const SWEEP_HOUR = 4;
export const STARTUP_SWEEP_DELAY_MS = 2 * MINUTE_MS;
const REMOVALS_AT_ONCE = 32;

export interface RecordingRetentionOptions {
  readonly store: Pick<Store, 'cameras' | 'feed'>;
  readonly recordingPath: (storagePath: string) => string;
  readonly clock: Clock;
  readonly log: Logger;
}

export interface SweepSummary {
  readonly recordings: number;
  readonly bytes: number;
  readonly failed: number;
}

export function nextSweepAt(now: Date): Date {
  const next = new Date(now);
  next.setHours(SWEEP_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

export class RecordingRetention {
  private daily: Cancel | undefined;
  private startup: Cancel | undefined;
  private sweeping: Promise<unknown> = Promise.resolve();
  private unsubscribe: (() => void) | undefined;

  constructor(private readonly options: RecordingRetentionOptions) {}

  start(): void {
    const { clock } = this.options;
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      if (
        change.table === 'cameras' &&
        change.record !== null &&
        change.oldRecord !== null &&
        change.record.keep_days !== change.oldRecord.keep_days
      ) {
        this.sweepInBackground();
      }
    });
    this.startup = clock.at(new Date(clock.now().getTime() + STARTUP_SWEEP_DELAY_MS), () => {
      this.startup = undefined;
      this.sweepInBackground();
    });
    this.armDaily();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.startup?.();
    this.startup = undefined;
    this.daily?.();
    this.daily = undefined;
  }

  sweep(): Promise<SweepSummary> {
    const run = this.sweeping.then(() => this.sweepNow());
    this.sweeping = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private armDaily(): void {
    const { clock } = this.options;
    this.daily = clock.at(nextSweepAt(clock.now()), () => {
      this.sweepInBackground();
      this.armDaily();
    });
  }

  private sweepInBackground(): void {
    background(this.sweep(), 'recording.sweep_failed');
  }

  private async sweepNow(): Promise<SweepSummary> {
    const removed = this.options.store.cameras.removeExpiredRecordings(this.options.clock.now());
    let failed = 0;
    for (const chunk of chunksOf(removed, REMOVALS_AT_ONCE)) {
      const results = await Promise.all(chunk.map((recording) => this.removeFiles(recording)));
      failed += results.filter((removedFiles) => !removedFiles).length;
    }
    const summary = {
      recordings: removed.length,
      bytes: removed.reduce((total, recording) => total + recording.bytes, 0),
      failed,
    };
    this.options.log.info('recording.pruned', summary);
    return summary;
  }

  private async removeFiles(recording: RecordingRow): Promise<boolean> {
    const path = this.options.recordingPath(recording.storage_path);
    try {
      await Promise.all([rm(path, { force: true }), rm(thumbnailPathOf(path), { force: true })]);
      return true;
    } catch (cause) {
      this.options.log.warn('recording.file_not_removed', {
        recordingId: recording.id,
        deviceId: recording.device_id,
        storagePath: recording.storage_path,
        reason: messageOf(cause),
      });
      return false;
    }
  }
}
