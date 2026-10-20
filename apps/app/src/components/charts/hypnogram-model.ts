import { hoursMinutes, clock, MINUTE_MS } from '../../format/time';
import type { ColourRole } from '../../design/tokens';
import {
  NIGHT_EDGE_PAD,
  NIGHT_GUTTER_COMPACT_W,
  NIGHT_GUTTER_W,
  nightX,
  type NightFrame,
  type NightWindow,
} from './night-axis';

export type HypnogramStage = 'awake' | 'rem' | 'light' | 'deep' | 'asleep';

export interface HypnogramSegment {
  readonly start: number;
  readonly end: number;
  readonly stage: HypnogramStage;
}

export const HYPNOGRAM_LANES = ['awake', 'rem', 'light', 'deep'] as const;

export const STAGE_NAMES: Readonly<Record<HypnogramStage, string>> = {
  awake: 'Awake',
  rem: 'REM',
  light: 'Light',
  deep: 'Deep',
  asleep: 'Asleep',
};

export const STAGE_COLOURS: Readonly<Record<HypnogramStage, ColourRole>> = {
  awake: 'sleep-awake',
  rem: 'sleep-rem',
  light: 'sleep-core',
  deep: 'sleep-deep',
  asleep: 'sleep-asleep',
};

const SUMMARY_ORDER = ['deep', 'light', 'rem', 'awake'] as const;
const BLOCK_PAD_PX = 3;
const AWAKE_PAD_PX = 1;
const MIN_BLOCK_PX = 2;
const BLOCK_GAP_PX = 2;
const BLOCK_RADIUS_PX = 4;
const BAND_HEIGHT_PX = 40;
const BAND_RADIUS_PX = 10;
const NO_STAGE_LANE = 2;

export const HEIGHT_PHONE = 152;
export const HEIGHT_DESKTOP = 200;
export const HEIGHT_COMPACT = 72;
export const AXIS_HEIGHT_FULL = 38;
export const AXIS_HEIGHT_MARKERS = 20;

export interface HypnogramFrame extends NightFrame {
  readonly width: number;
  readonly height: number;
  readonly plotHeight: number;
  readonly laneHeight: number;
}

export interface FrameInput {
  readonly window: NightWindow;
  readonly width: number;
  readonly height: number;
  readonly compact: boolean;
  readonly markers: boolean;
}

export function axisHeightOf(compact: boolean, markers: boolean): number {
  if (compact) {
    return markers ? AXIS_HEIGHT_MARKERS : 0;
  }
  return AXIS_HEIGHT_FULL;
}

export function frameOf(input: FrameInput): HypnogramFrame {
  const plotHeight = Math.max(1, input.height - axisHeightOf(input.compact, input.markers));
  return {
    window: input.window,
    width: input.width,
    height: input.height,
    left: input.compact ? NIGHT_GUTTER_COMPACT_W : NIGHT_GUTTER_W,
    right: input.width - NIGHT_EDGE_PAD,
    plotHeight,
    laneHeight: plotHeight / HYPNOGRAM_LANES.length,
  };
}

export function isUnstaged(segments: readonly HypnogramSegment[]): boolean {
  return segments.length > 0 && segments.every((segment) => segment.stage === 'asleep');
}

function laneOf(stage: HypnogramStage): number {
  return stage === 'asleep' ? NO_STAGE_LANE : HYPNOGRAM_LANES.indexOf(stage);
}

export function laneCentre(frame: HypnogramFrame, stage: HypnogramStage): number {
  return laneOf(stage) * frame.laneHeight + frame.laneHeight / 2;
}

export interface Block {
  readonly key: string;
  readonly segment: HypnogramSegment;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

export function blockOf(segment: HypnogramSegment, frame: HypnogramFrame): Block {
  const left = nightX(frame, segment.start);
  const width = Math.max(MIN_BLOCK_PX, nightX(frame, segment.end) - left - BLOCK_GAP_PX);
  const awake = segment.stage === 'awake';
  const pad = awake ? AWAKE_PAD_PX : BLOCK_PAD_PX;
  return {
    key: `${String(segment.start)}-${String(segment.end)}-${segment.stage}`,
    segment,
    x: left + BLOCK_GAP_PX / 2,
    y: laneOf(segment.stage) * frame.laneHeight + pad,
    width,
    height: Math.max(1, frame.laneHeight - pad * 2),
    radius: Math.min(BLOCK_RADIUS_PX, width / 2),
  };
}

export interface Band {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

export function bandOf(frame: HypnogramFrame): Band {
  const height = Math.min(BAND_HEIGHT_PX, Math.max(1, frame.plotHeight - 8));
  return {
    x: frame.left,
    y: (frame.plotHeight - height) / 2,
    width: Math.max(1, frame.right - frame.left),
    height,
    radius: Math.min(BAND_RADIUS_PX, height / 2),
  };
}

export interface Connector {
  readonly x: number;
  readonly from: number;
  readonly to: number;
}

export function connectorsOf(
  segments: readonly HypnogramSegment[],
  frame: HypnogramFrame,
): Connector[] {
  const connectors: Connector[] = [];
  segments.forEach((segment, index) => {
    const next = segments[index + 1];
    if (next === undefined || laneOf(next.stage) === laneOf(segment.stage)) {
      return;
    }
    connectors.push({
      x: nightX(frame, segment.end),
      from: laneCentre(frame, segment.stage),
      to: laneCentre(frame, next.stage),
    });
  });
  return connectors;
}

export interface GhostPoint {
  readonly share: number;
  readonly level: number;
}

export const GHOST_STEPS: readonly GhostPoint[] = [
  { share: 0, level: 0.5 },
  { share: 0.12, level: 0.9 },
  { share: 0.3, level: 0.9 },
  { share: 0.4, level: 0.62 },
  { share: 0.55, level: 0.62 },
  { share: 0.62, level: 0.38 },
  { share: 0.75, level: 0.38 },
  { share: 0.8, level: 0.62 },
  { share: 0.9, level: 0.62 },
  { share: 0.96, level: 0.15 },
  { share: 1, level: 0.15 },
];

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function ghostPath(frame: HypnogramFrame): string {
  const span = frame.right - frame.left;
  let path = '';
  let previous = 0;
  GHOST_STEPS.forEach((step, index) => {
    const x = round(frame.left + step.share * span);
    const y = round(step.level * frame.plotHeight);
    path +=
      index === 0
        ? `M${String(x)} ${String(y)}`
        : `L${String(x)} ${String(previous)}L${String(x)} ${String(y)}`;
    previous = y;
  });
  return path;
}

export function spanAt(segments: readonly HypnogramSegment[], at: number): HypnogramSegment | null {
  return (
    segments.find((segment) => at >= segment.start && at < segment.end) ??
    segments[segments.length - 1] ??
    null
  );
}

function withoutMeridiem(text: string): string {
  return text.replace(/\s?(AM|PM)$/i, '');
}

function meridiemOf(text: string): string {
  return text.slice(-2);
}

export interface Readout {
  readonly heading: string;
  readonly stage: HypnogramStage;
  readonly name: string;
  readonly length: string;
  readonly text: string;
}

export function readoutOf(segment: HypnogramSegment): Readout {
  const start = clock(segment.start);
  const end = clock(segment.end);
  const first = meridiemOf(start) === meridiemOf(end) ? withoutMeridiem(start) : start;
  const heading = `${first} – ${end}`;
  const length = hoursMinutes((segment.end - segment.start) / MINUTE_MS);
  const name = STAGE_NAMES[segment.stage];
  return {
    heading,
    stage: segment.stage,
    name,
    length,
    text: `${name} · ${heading} · ${length}`,
  };
}

export function stepAt(
  segments: readonly HypnogramSegment[],
  at: number | null,
  direction: 1 | -1,
): number | null {
  if (segments.length === 0) {
    return null;
  }
  const current =
    at === null ? -1 : segments.findIndex((segment) => at >= segment.start && at < segment.end);
  const fallback = direction === 1 ? 0 : segments.length - 1;
  const index =
    current < 0 ? fallback : Math.min(segments.length - 1, Math.max(0, current + direction));
  const target = segments[index];
  return target === undefined ? null : (target.start + target.end) / 2;
}

function minutesIn(segments: readonly HypnogramSegment[], stage: HypnogramStage): number {
  return segments
    .filter((segment) => segment.stage === stage)
    .reduce((sum, segment) => sum + (segment.end - segment.start) / MINUTE_MS, 0);
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function awakeSentence(segments: readonly HypnogramSegment[]): string {
  const wakes = segments.filter((segment) => segment.stage === 'awake');
  if (wakes.length === 0) {
    return 'No time awake.';
  }
  const longest = Math.max(...wakes.map((segment) => segment.end - segment.start)) / MINUTE_MS;
  return `${plural(wakes.length, 'time')} awake, longest ${plural(Math.round(longest), 'minute')}.`;
}

export function summaryOf(segments: readonly HypnogramSegment[], label: string): string {
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (first === undefined || last === undefined) {
    return `${label}: no sleep recorded.`;
  }
  const range = `${clock(first.start)} to ${clock(last.end)}`;
  if (isUnstaged(segments)) {
    const total = hoursMinutes(minutesIn(segments, 'asleep'));
    return `${label}, ${range}. Asleep ${total}. Stages were not recorded.`;
  }
  const totals = SUMMARY_ORDER.map(
    (stage) => `${STAGE_NAMES[stage]} ${hoursMinutes(minutesIn(segments, stage))}`,
  ).join(', ');
  return `${label}, ${range}. ${awakeSentence(segments)} ${totals}.`;
}
