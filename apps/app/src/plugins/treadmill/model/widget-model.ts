import type { InclineScale, TreadmillLiveFrame, TreadmillStateView } from '@smarteverything/domain';
import type { FrameClass, WidgetFrameBox } from '../../../components/widget-board';
import type { VisualPx } from '../../../features/device-visuals';
import { count } from '../../../format/number';
import { inclineText } from './counters-model';
import { movingLine, unitWord } from './incline-model';
import { todayRings, type StatsView, type TodayRing } from './today-model';
import { speedText } from './treadmill-model';

export type LiveFace = 'strip' | 'stack' | 'row' | 'panel';

const HEADER_TOUCH = 40;
const HEADER_POINTER = 32;
const BODY_GAP = 12;
const GAUGE_PAD = 8;
const GAUGE_MIN = 112;
const GAUGE_MAX = 200;
const CELL = 12;
const CELL_GAP = 3;
const MIN_WEEKS = 8;
const MAX_WEEKS = 53;
const STRIP_TREND_FROM = 440;

export function liveFaceOf(cls: FrameClass): LiveFace {
  switch (cls) {
    case 'xs':
    case 's':
    case 'm':
      return 'strip';
    case 'l':
      return 'stack';
    case 'w':
      return 'row';
    case 'xl':
      return 'panel';
  }
}

export function bodyHeightOf(frame: WidgetFrameBox): number {
  const header = frame.idiom === 'touch' ? HEADER_TOUCH : HEADER_POINTER;
  return Math.max(0, frame.height - header - BODY_GAP);
}

export function gaugePxOf(bodyHeight: number): number {
  return Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, bodyHeight - GAUGE_PAD));
}

const VISUAL_PX: Readonly<Record<LiveFace, VisualPx>> = {
  strip: 72,
  stack: 72,
  row: 96,
  panel: 128,
};

export function stripShowsTrend(width: number): boolean {
  return width >= STRIP_TREND_FROM;
}

export function visualPxOf(face: LiveFace, bodyHeight: number): VisualPx {
  const wanted = VISUAL_PX[face];
  if (bodyHeight >= wanted) {
    return wanted;
  }
  return bodyHeight >= 72 ? 72 : 48;
}

export function calendarWeeks(width: number): number {
  return Math.min(
    MAX_WEEKS,
    Math.max(MIN_WEEKS, Math.floor((width + CELL_GAP) / (CELL + CELL_GAP))),
  );
}

const HEATMAP_BLOCK = 7 * (CELL + CELL_GAP) + 20;
const CALENDAR_FOOTER_ONE_LINE = 20;
const CALENDAR_FOOTER_TWO_LINES = 40;
const CALENDAR_GAPS = 36;
const BAR_LABELS = 32;
const MIN_CALENDAR_BARS = 32;
const ONE_LINE_FOOTER_FROM = 560;

export function calendarBarsHeight(bodyHeight: number, width: number): number {
  const footer =
    width >= ONE_LINE_FOOTER_FROM ? CALENDAR_FOOTER_ONE_LINE : CALENDAR_FOOTER_TWO_LINES;
  const room = bodyHeight - HEATMAP_BLOCK - footer - CALENDAR_GAPS - BAR_LABELS;
  return room >= MIN_CALENDAR_BARS ? room : 0;
}

export interface InclineReadout {
  readonly value: string;
  readonly figure: string;
  readonly unit: string;
  readonly fill: number;
  readonly note: string | null;
  readonly climb: string | null;
  readonly sentence: string;
}

export function inclineFigureUnit(scale: InclineScale): string {
  return scale === 'percent' ? '% incline' : scale === 'levels' ? 'incline level' : unitWord(scale);
}

export function inclineFill(
  raw: number,
  range: NonNullable<TreadmillStateView['limits']['incline']>,
): number {
  const span = range.max - range.min;
  return span <= 0 ? 0 : Math.min(1, Math.max(0, (raw - range.min) / span));
}

export function inclineReadoutOf(
  frame: TreadmillLiveFrame,
  range: TreadmillStateView['limits']['incline'],
): InclineReadout | null {
  const { belt, session } = frame;
  if (range === null || belt.inclinePercent === null) {
    return null;
  }
  const value = inclineText(belt.inclinePercent, belt.inclineScale);
  const climbM = session === null ? null : session.climbM;
  const climb = climbM === null ? null : `${count(Math.round(climbM))} m`;
  const moving = movingLine(belt.inclinePercent, belt.inclineTarget);
  const parts = [
    `Incline ${value}`,
    ...(moving === null ? [] : [moving]),
    ...(climb === null ? [] : [`climb ${climb}`]),
  ];
  return {
    value,
    figure: String(belt.inclinePercent),
    unit: inclineFigureUnit(belt.inclineScale),
    fill: inclineFill(belt.inclinePercent, range),
    note: moving ?? (climb === null ? null : `Climb ${climb}`),
    climb,
    sentence: parts.join(', '),
  };
}

export function speedInclineSentence(speedKmh: number, readout: InclineReadout | null): string {
  const speed = `Speed ${speedText(speedKmh)} kilometres per hour`;
  return readout === null ? speed : `${speed}, ${readout.sentence}`;
}

export function climbRingOf(
  totals: { readonly climbM: number },
  previous: { readonly climbM: number },
): TodayRing | null {
  if (totals.climbM <= 0 && previous.climbM <= 0) {
    return null;
  }
  return {
    key: 'climb',
    colour: 'viz-violet',
    name: 'Climb this week',
    done: `${count(Math.round(totals.climbM))} m`,
    goal: `${count(Math.round(previous.climbM))} m last week`,
    progress: previous.climbM > 0 ? totals.climbM / previous.climbM : totals.climbM > 0 ? 1 : 0,
  };
}

export function ringsWithClimb(view: StatsView): readonly TodayRing[] {
  const rings = todayRings(view);
  const climb = climbRingOf(view.stats.totals, view.stats.previous);
  return climb === null ? rings : [...rings.slice(0, 2), climb, ...rings.slice(2)];
}

const LEGEND_ROW = 22;
const LEGEND_WIDE = 5;
const LEGEND_MIN = 3;
const LEGEND_MAX = 4;

export function legendLines(wide: boolean, bodyHeight: number): number {
  if (wide) {
    return LEGEND_WIDE;
  }
  return Math.min(LEGEND_MAX, Math.max(LEGEND_MIN, Math.floor(bodyHeight / LEGEND_ROW)));
}
