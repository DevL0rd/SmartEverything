import type { PhotoSaveMode, VideoEdit } from '@smarteverything/domain';
import { playTime } from '../../../format/time';

export interface Trim {
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

export type TrimHandle = 'start' | 'end';

export function trimOf(durationMs: number): Trim {
  return { startMs: 0, endMs: durationMs, durationMs };
}

export function movedTrim(trim: Trim, handle: TrimHandle, ms: number): Trim {
  const at = Math.round(ms);
  if (handle === 'start') {
    return { ...trim, startMs: Math.min(Math.max(0, at), trim.endMs - 1) };
  }
  return { ...trim, endMs: Math.max(Math.min(trim.durationMs, at), trim.startMs + 1) };
}

export function isWhole(trim: Trim): boolean {
  return trim.startMs === 0 && trim.endMs === trim.durationMs;
}

export function videoEditOf(trim: Trim, stabilize: boolean, mode: PhotoSaveMode): VideoEdit | null {
  const cut = isWhole(trim) ? null : { startMs: trim.startMs, endMs: trim.endMs };
  if (cut === null && !stabilize) return null;
  return { trim: cut, stabilize, mode };
}

export function msAt(share: number, durationMs: number): number {
  return Math.min(1, Math.max(0, share)) * durationMs;
}

export function shareAt(ms: number, durationMs: number): number {
  return durationMs <= 0 ? 0 : Math.min(1, Math.max(0, ms / durationMs));
}

export function trimSummary(trim: Trim): string {
  const kept = (trim.endMs - trim.startMs) / 1000;
  return `${playTime(trim.startMs / 1000)} to ${playTime(trim.endMs / 1000)} · ${playTime(kept)} kept`;
}

export function frameCount(barWidth: number, frameWidth: number): number {
  return barWidth <= 0 ? 0 : Math.ceil(barWidth / frameWidth);
}

export function frameTimes(count: number, durationMs: number): readonly number[] {
  return Array.from({ length: count }, (_, index) => ((index + 0.5) / count) * durationMs);
}
