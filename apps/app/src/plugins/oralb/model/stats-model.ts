import type { BrushingSession, BrushingStats } from '@smarteverything/domain';
import { bucketLabel } from '../../toothbrush/model/stats-model';
import { FACE_LEVELS, isSpecial } from './face-model';

export const STRIP_SESSIONS = 30;

export interface FaceBar {
  readonly key: string;
  readonly level: number | null;
  readonly special: boolean;
}

export function faceBars(sessions: readonly BrushingSession[]): readonly FaceBar[] {
  return [...sessions]
    .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))
    .slice(-STRIP_SESSIONS)
    .map((session) => {
      const level = session.details?.face ?? null;
      return { key: session.id, level, special: isSpecial(level) };
    });
}

export function bestRun(bars: readonly FaceBar[]): number {
  let best = 0;
  let run = 0;
  for (const bar of bars) {
    run = bar.special ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export interface FaceShare {
  readonly key: string;
  readonly label: string;
  readonly sessions: number;
  readonly special: number;
  readonly share: number;
}

export function faceShares(stats: BrushingStats): readonly FaceShare[] {
  return (stats.faces ?? []).map((bucket) => ({
    key: bucket.key,
    label: bucketLabel(stats.range, bucket.key),
    sessions: bucket.sessions,
    special: bucket.special,
    share: bucket.sessions === 0 ? 0 : bucket.special / bucket.sessions,
  }));
}

export function facesSummary(stats: BrushingStats): string | null {
  const shares = faceShares(stats);
  const sessions = shares.reduce((sum, bucket) => sum + bucket.sessions, 0);
  const special = shares.reduce((sum, bucket) => sum + bucket.special, 0);
  if (sessions === 0) {
    return null;
  }
  return `${String(special)} of ${String(sessions)} brushes ended on a special face`;
}

export function facesLabel(bars: readonly FaceBar[]): string {
  const shown = bars.filter((bar) => bar.level !== null && bar.level > 0);
  return `Result face of the last ${String(bars.length)} brushes, ${String(shown.length)} with a face. Taller bars are higher faces out of ${String(FACE_LEVELS)}.`;
}

export interface PressureShare {
  readonly key: 'light' | 'good' | 'hard' | 'rest';
  readonly label: string;
  readonly share: number;
}

export function pressureShares(stats: BrushingStats): readonly PressureShare[] {
  const hard = stats.excessShare;
  if (hard === null) {
    return [];
  }
  const light = stats.lowPressureShare;
  if (light === null) {
    return [
      { key: 'hard', label: 'Too hard', share: hard },
      { key: 'rest', label: 'Good or light', share: Math.max(0, 1 - hard) },
    ];
  }
  return [
    { key: 'light', label: 'Light', share: light },
    { key: 'good', label: 'Good', share: Math.max(0, 1 - light - hard) },
    { key: 'hard', label: 'Too hard', share: hard },
  ];
}

export function pressureSharesLabel(shares: readonly PressureShare[]): string {
  return `Pressure shares: ${shares.map((part) => `${part.label} ${String(Math.round(part.share * 100))} percent`).join(', ')}`;
}

export interface ForceBucket {
  readonly key: string;
  readonly label: string;
  readonly min: number | null;
  readonly max: number | null;
}

export function forceBuckets(stats: BrushingStats): readonly ForceBucket[] {
  return (stats.force ?? []).map((bucket) => ({
    key: bucket.key,
    label: bucketLabel(stats.range, bucket.key),
    min: bucket.averageN,
    max: bucket.peakN,
  }));
}

export function forceLine(stats: BrushingStats): string | null {
  const known = (stats.force ?? []).filter(
    (bucket) => bucket.averageN !== null && bucket.peakN !== null,
  );
  if (known.length === 0) {
    return null;
  }
  const average = known.reduce((sum, bucket) => sum + (bucket.averageN ?? 0), 0) / known.length;
  const peak = Math.max(...known.map((bucket) => bucket.peakN ?? 0));
  return `Average ${average.toFixed(1)} N, strongest ${peak.toFixed(1)} N`;
}

export const FORCE_NOTE =
  'Each bar runs from the average to the peak force of that period, read from the handle’s own record.';
