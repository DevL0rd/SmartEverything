import type { ChartPoint } from '../../components/charts';
import { TYPE_SCALE, type Idiom } from '../../design/tokens';
import type { WideClass } from '../../features/devices';

export const MIN_LINE_POINTS = 2;

const HEAD_GAP_PX = 4;
const CAPTION_LINE_PX = Math.max(TYPE_SCALE.touch.caption[1], TYPE_SCALE.pointer.caption[1]);

export const GRAPH_HEAD_PX = CAPTION_LINE_PX + HEAD_GAP_PX;
export const GRAPH_MIN_PX = CAPTION_LINE_PX;

export interface GraphFit {
  readonly head: boolean;
  readonly height: number | null;
}

export function graphFit(cap: number, room: number | null): GraphFit {
  if (room === null) {
    return { head: false, height: cap };
  }
  const below = Math.min(cap, room - GRAPH_HEAD_PX);
  if (below >= GRAPH_MIN_PX) {
    return { head: true, height: below };
  }
  const alone = Math.min(cap, room);
  return { head: false, height: alone >= GRAPH_MIN_PX ? alone : null };
}

export function domainOf(series: readonly (readonly ChartPoint[])[]): readonly [number, number] {
  const peak = Math.max(0, ...series.flatMap((points) => points.map((point) => point.v)));
  return [0, peak === 0 ? 1 : peak];
}

const LIST_GAP_PX = 2;

export function listRowsThatFit(room: number, idiom: Idiom): number {
  const line = TYPE_SCALE[idiom].caption[1];
  const rows = Math.floor((room - line) / (line + LIST_GAP_PX));
  return Math.max(0, rows);
}

export interface LineFit {
  readonly width: number | null;
  readonly ends: ReadonlyMap<string, number>;
}

export const LINE_START: LineFit = { width: null, ends: new Map() };

export function lineWidthAfter(fit: LineFit, width: number): LineFit {
  return fit.width === width ? fit : { ...fit, width };
}

export function lineEndAfter(fit: LineFit, key: string, end: number): LineFit {
  return fit.ends.get(key) === end ? fit : { ...fit, ends: new Map(fit.ends).set(key, end) };
}

export function fitsLine(end: number | undefined, width: number | null): boolean {
  return width === null || end === undefined || end <= width + 0.5;
}

export function cellIconForm(cls: WideClass): boolean {
  return cls === 'm';
}
