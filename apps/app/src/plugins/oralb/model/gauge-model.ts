import type { BrushLiveFrame, BrushPressure, BrushProfile } from '@smarteverything/domain';

export const FORCE_MAX = 3.5;

export type PressureBand = 'light' | 'good' | 'hard';

export interface ForceBands {
  readonly lightBelow: number;
  readonly highAbove: number;
  readonly samples: number;
}

export interface BandSpan {
  readonly band: PressureBand;
  readonly from: number;
  readonly to: number;
}

export interface BandLayout {
  readonly spans: readonly BandSpan[];
  readonly learned: boolean;
}

export type MeterKind = 'gauge' | 'state' | 'advert';

export const BAND_OF: Readonly<Record<BrushPressure, PressureBand>> = {
  no_contact: 'light',
  optimal: 'good',
  too_high: 'hard',
};

export const BAND_NAME: Readonly<Record<PressureBand, string>> = {
  light: 'Light',
  good: 'Good',
  hard: 'Too hard',
};

const THIRD = 1 / 3;

export function shareOf(force: number): number {
  return Math.min(1, Math.max(0, force / FORCE_MAX));
}

export function bandsOf(bands: ForceBands | null): BandLayout {
  if (bands === null || bands.lightBelow >= bands.highAbove) {
    return {
      learned: false,
      spans: [
        { band: 'light', from: 0, to: THIRD },
        { band: 'good', from: THIRD, to: 2 * THIRD },
        { band: 'hard', from: 2 * THIRD, to: 1 },
      ],
    };
  }
  const low = shareOf(bands.lightBelow);
  const high = shareOf(bands.highAbove);
  return {
    learned: true,
    spans: [
      { band: 'light', from: 0, to: low },
      { band: 'good', from: low, to: high },
      { band: 'hard', from: high, to: 1 },
    ],
  };
}

export function bandAt(layout: BandLayout, force: number): PressureBand {
  const share = shareOf(force);
  const found = layout.spans.find((span) => share >= span.from && share < span.to);
  return found?.band ?? 'hard';
}

export function meterKindOf(
  profile: Pick<BrushProfile, 'pressure'>,
  frame: Pick<BrushLiveFrame, 'force' | 'liveSource'>,
): MeterKind {
  if (profile.pressure === 'force' && frame.force !== null) {
    return 'gauge';
  }
  return frame.liveSource === 'advert' ? 'advert' : 'state';
}

export function pressureBandOf(
  frame: Pick<BrushLiveFrame, 'pressure' | 'force'>,
  layout: BandLayout,
): PressureBand | null {
  if (frame.force !== null) {
    return bandAt(layout, frame.force);
  }
  return frame.pressure === null ? null : BAND_OF[frame.pressure];
}

export function gaugeLabel(band: PressureBand | null, learned: boolean): string {
  const word = band === null ? 'no pressure reading' : BAND_NAME[band];
  return `Pressure gauge: ${word}${learned ? '' : ', still learning your brushing'}`;
}

export const LEARNING_NOTE = 'learning your brushing';

export const ADVERT_NOTE = 'Light pressure needs a connection';

export function meterLabel(kind: MeterKind, band: PressureBand | null): string {
  const word = band === null ? 'no pressure reading' : BAND_NAME[band];
  const extra = kind === 'advert' ? '. Light pressure needs a connection' : '';
  return `Pressure: ${word}${extra}`;
}
