import type { WakeSensitivity } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { nearThresholdOf, thresholdOf } from '../../wake-name/keyword-lines';

export const SUMMARY_MS = 30_000;
export const NEAR_SETTLE_MS = 1500;
const FULL_SCALE = 32_768;
const FLOOR_DBFS = -120;
const SAMPLES_PER_MS = 16;
export const SILENT_MS = 10_000;
const SILENT_PEAK = 2;

export type EarState = 'listening' | 'resting' | 'wake_off' | 'no_phrase';

export interface NearMiss {
  readonly phrase: string;
  readonly heardAt: number;
  readonly snippetDbfs: number;
  readonly sensitivity: WakeSensitivity;
}

export interface EarWatchOptions {
  readonly fields: Readonly<Record<string, string>>;
  readonly log: Logger;
  readonly missed: (miss: NearMiss) => void;
}

function dbfsOf(ratio: number): number {
  return Math.round(Math.max(FLOOR_DBFS, 20 * Math.log10(ratio)) * 10) / 10;
}

export class EarWatch {
  private startedAt: number | null = null;
  private frames = 0;
  private samples = 0;
  private squares = 0;
  private peak = 0;
  private nearMisses = 0;
  private wakes = 0;
  private wokeAt = Number.NEGATIVE_INFINITY;
  private pending: NearMiss | null = null;
  private silentSince: number | null = null;
  private silentReported = false;

  constructor(private readonly options: EarWatchOptions) {}

  heard(pcm: Int16Array, now: number, state: EarState, sensitivity: WakeSensitivity | null): void {
    this.startedAt ??= now;
    this.frames += 1;
    this.samples += pcm.length;
    let framePeak = 0;
    for (const sample of pcm) {
      this.squares += (sample / FULL_SCALE) ** 2;
      framePeak = Math.max(framePeak, Math.abs(sample));
    }
    this.peak = Math.max(this.peak, framePeak);
    this.watchSilence(framePeak, now);
    this.settle(now);
    if (now - this.startedAt >= SUMMARY_MS) {
      this.summarize(now, state, sensitivity);
    }
  }

  near(miss: NearMiss): boolean {
    if (miss.heardAt - this.wokeAt < NEAR_SETTLE_MS) {
      return false;
    }
    this.pending ??= miss;
    return true;
  }

  woke(now: number): void {
    this.pending = null;
    this.wokeAt = now;
    this.wakes += 1;
  }

  private watchSilence(framePeak: number, now: number): void {
    if (framePeak > SILENT_PEAK) {
      if (this.silentReported && this.silentSince !== null) {
        this.options.log.info('wake.ear_sound_returned', {
          ...this.options.fields,
          silentMs: now - this.silentSince,
        });
      }
      this.silentSince = null;
      this.silentReported = false;
      return;
    }
    this.silentSince ??= now;
    if (!this.silentReported && now - this.silentSince >= SILENT_MS) {
      this.silentReported = true;
      this.options.log.warn('wake.ear_silent', {
        ...this.options.fields,
        silentMs: now - this.silentSince,
        peakDbfs: dbfsOf(framePeak / FULL_SCALE),
      });
    }
  }

  private settle(now: number): void {
    const miss = this.pending;
    if (miss === null || now - miss.heardAt < NEAR_SETTLE_MS) {
      return;
    }
    this.pending = null;
    this.nearMisses += 1;
    this.options.log.info('wake.near_miss', {
      ...this.options.fields,
      phrase: miss.phrase,
      heardAt: new Date(miss.heardAt).toISOString(),
      sensitivity: miss.sensitivity,
      threshold: thresholdOf(miss.sensitivity),
      scoreAtLeast: nearThresholdOf(miss.sensitivity),
      snippetDbfs: miss.snippetDbfs,
    });
    this.options.missed(miss);
  }

  private summarize(now: number, state: EarState, sensitivity: WakeSensitivity | null): void {
    this.options.log.info('wake.ear_summary', {
      ...this.options.fields,
      state,
      sensitivity,
      windowMs: now - (this.startedAt ?? now),
      frames: this.frames,
      audioMs: Math.round(this.samples / SAMPLES_PER_MS),
      levelDbfs: dbfsOf(Math.sqrt(this.squares / Math.max(1, this.samples))),
      peakDbfs: dbfsOf(this.peak / FULL_SCALE),
      silentMs: this.silentSince === null ? 0 : now - this.silentSince,
      nearMisses: this.nearMisses,
      wakes: this.wakes,
    });
    this.startedAt = null;
    this.frames = 0;
    this.samples = 0;
    this.squares = 0;
    this.peak = 0;
    this.nearMisses = 0;
    this.wakes = 0;
  }
}
