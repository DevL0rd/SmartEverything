import type { BrushLiveFrame, BrushStateView, LiveSource } from '@smarteverything/domain';
import { relative } from '../../../format/time';
import { QUARTER_COUNT, targetsOf, quartersOf, type Quarter } from './arch-model';
import { oralbModeOf } from './wave-model';

export type StageKind = 'arch' | 'sections' | 'ring';

export function stageKindOf(
  view: Pick<BrushStateView, 'profile'>,
  frame: BrushLiveFrame,
): StageKind {
  if (oralbModeOf(frame.mode) === 'tongue_clean') {
    return 'ring';
  }
  const sectors = view.profile.brand === 'oralb' ? view.profile.sectors : 0;
  return sectors === 0 || sectors === QUARTER_COUNT ? 'arch' : 'sections';
}

export function pacerOn(view: Pick<BrushStateView, 'profile'>): boolean {
  return view.profile.brand === 'oralb' && view.profile.sectors > 0;
}

export function pacerSchedule(view: Pick<BrushStateView, 'handle'>): readonly number[] | null {
  return view.handle.oralb?.pacer ?? null;
}

export function finishedFrame(frame: Pick<BrushLiveFrame, 'activity'>): boolean {
  return frame.activity !== 'brushing' && frame.activity !== 'paused';
}

export function liveQuarters(view: BrushStateView, frame: BrushLiveFrame): readonly Quarter[] {
  return quartersOf({
    zoneSeconds: frame.zoneSeconds,
    targets: targetsOf(pacerSchedule(view), frame.routineS),
    current: frame.zone,
    finished: finishedFrame(frame),
    pacerOn: pacerOn(view),
  });
}

export interface SectionStrip {
  readonly count: number;
  readonly current: number;
}

export function sectionsOf(view: BrushStateView, frame: BrushLiveFrame): SectionStrip {
  const count = view.profile.brand === 'oralb' ? view.profile.sectors : 0;
  const routine = frame.routineS ?? 0;
  const guessed =
    routine <= 0 || count <= 0 ? 1 : Math.floor((frame.elapsedS / routine) * count) + 1;
  return { count, current: Math.min(count, Math.max(1, frame.zone ?? guessed)) };
}

export function sectionCaption(strip: SectionStrip): string {
  return `Section ${String(strip.current)} of ${String(strip.count)}`;
}

export const TONGUE_NOTE = 'Tongue Clean is timed as one block. The handle reports no quarters.';

export const SOURCE_TEXT: Readonly<Record<LiveSource, string>> = {
  advert: 'Live, from the broadcast',
  link: 'Live, connected',
};

export const SOURCE_EXPLAIN: Readonly<Record<LiveSource, string>> = {
  advert:
    'The handle broadcasts its timer, quarter and whether you press too hard. Connect for force and the drive wave in the toothbrush settings.',
  link: 'Your phone is connected to the handle, so the force and the drive angle are live. The Oral-B app cannot connect while this is on.',
};

export function sourceChip(
  frame: Pick<BrushLiveFrame, 'liveSource' | 'activity'>,
  view: Pick<BrushStateView, 'link'>,
  now: number,
): string | null {
  if (frame.liveSource !== null && !finishedFrame(frame)) {
    return SOURCE_TEXT[frame.liveSource];
  }
  const { lastHeardAt } = view.link;
  return lastHeardAt === null ? null : `Synced ${relative(lastHeardAt, now)}`;
}

export function isLiveSource(frame: Pick<BrushLiveFrame, 'liveSource' | 'activity'>): boolean {
  return frame.liveSource !== null && !finishedFrame(frame);
}

export function connectedOf(frame: Pick<BrushLiveFrame, 'liveSource'>): boolean {
  return frame.liveSource === 'link';
}

export type StageColumns = 'stacked' | 'split' | 'wide';

export interface StageLayout {
  readonly columns: StageColumns;
  readonly archPx: number;
  readonly handlePx: 220 | 280;
  readonly detailsPx: number;
}

export const HANDLE_COLUMN = 52;

const GAP = 16;
const SPLIT_FROM = 560;
const WIDE_FROM = 900;
const ARCH_MAX = 300;
const ARCH_MIN = 200;
const DETAILS_MIN = 260;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function layoutOf(width: number): StageLayout {
  if (width < SPLIT_FROM) {
    return {
      columns: 'stacked',
      archPx: clamp(width - HANDLE_COLUMN - GAP, ARCH_MIN - 40, ARCH_MAX),
      handlePx: 220,
      detailsPx: width,
    };
  }
  if (width < WIDE_FROM) {
    const archPx = clamp(width - HANDLE_COLUMN - 2 * GAP - DETAILS_MIN, ARCH_MIN, ARCH_MAX);
    return {
      columns: 'split',
      archPx,
      handlePx: 220,
      detailsPx: width - HANDLE_COLUMN - 2 * GAP - archPx,
    };
  }
  return {
    columns: 'wide',
    archPx: ARCH_MAX,
    handlePx: 280,
    detailsPx: width - HANDLE_COLUMN - 2 * GAP - ARCH_MAX,
  };
}

export function gaugePx(detailsPx: number): number {
  return clamp(Math.round(detailsPx * 0.55), 120, 190);
}
