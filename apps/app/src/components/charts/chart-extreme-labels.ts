import { bisector } from 'd3-array';
import { LABEL_W, X_AXIS_H, type Model } from './chart-model';
import { clamp, extremaOf, type ChartPoint } from './scale';

const CAPTION_HEIGHT = 16;
const PEAK_OFFSET = CAPTION_HEIGHT + 2;
const LOW_OFFSET = 4;
const STROKE_CLEARANCE = 4;
const byTime = bisector((point: ChartPoint) => point.t);

interface LabelPosition {
  readonly left: number;
  readonly top: number;
  readonly value: number;
}

interface TraceSpan {
  readonly top: number;
  readonly bottom: number;
}

function traceSpan(model: Model, left: number, point: ChartPoint): TraceSpan {
  const start = model.invert(left - STROKE_CLEARANCE);
  const end = model.invert(left + LABEL_W + STROKE_CLEARANCE);
  let top = model.y(point.v);
  let bottom = top;
  for (const trace of model.drawn) {
    for (const segment of trace.segments) {
      const first = byTime.left(segment, start);
      const last = byTime.right(segment, end);
      if (first === segment.length || last === 0) continue;
      for (const sample of segment.slice(Math.max(0, first - 1), last + 1)) {
        const y = model.y(sample.v);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  const bounds = { min: model.box.top, max: model.box.bottom };
  return { top: clamp(top, bounds), bottom: clamp(bottom, bounds) };
}

function annotationLeft(model: Model, x: number): number {
  const max = Math.max(0, model.box.width - LABEL_W);
  return clamp(x - LABEL_W / 2, { min: Math.min(model.box.left, max), max });
}

function peakLeft(model: Model, edge: number, left: number): number {
  if (model.marker === null || edge >= CAPTION_HEIGHT + PEAK_OFFSET) {
    return left;
  }
  const markerX = model.x(model.marker.at);
  if (markerX < model.box.left || markerX > model.box.right) return left;
  const markerLeft = clamp(markerX - LABEL_W / 2, { min: 0, max: model.box.width - LABEL_W });
  if (left >= markerLeft + LABEL_W || left + LABEL_W <= markerLeft) return left;
  const before = markerLeft - LABEL_W;
  const after = markerLeft + LABEL_W;
  return before >= model.box.left && (after + LABEL_W > model.box.width || left < markerLeft)
    ? before
    : Math.min(after, model.box.width - LABEL_W);
}

function lowLabel(model: Model, point: ChartPoint): LabelPosition {
  const left = annotationLeft(model, model.x(point.t));
  const { bottom } = traceSpan(model, left, point);
  return { left, top: bottom + LOW_OFFSET, value: point.v };
}

function overlaps(left: number, top: number, low: LabelPosition): boolean {
  return Math.abs(left - low.left) < LABEL_W && Math.abs(top - low.top) < CAPTION_HEIGHT;
}

function peakLabel(model: Model, point: ChartPoint, low: LabelPosition): LabelPosition {
  const centred = annotationLeft(model, model.x(point.t));
  const span = traceSpan(model, centred, point);
  const below = span.bottom + LOW_OFFSET;
  const anchor = model.y(point.v);
  const axisTop = model.box.height - X_AXIS_H + 2;
  if (
    below - anchor < anchor - (span.top - PEAK_OFFSET + CAPTION_HEIGHT) &&
    below + CAPTION_HEIGHT <= axisTop &&
    !overlaps(centred, below, low)
  ) {
    return { left: centred, top: below, value: point.v };
  }
  const left = peakLeft(model, span.top, centred);
  const top = left === centred ? span.top : traceSpan(model, left, point).top;
  return { left, top: top - PEAK_OFFSET, value: point.v };
}

export function extremeLabelsOf(model: Model): readonly LabelPosition[] {
  const extrema = extremaOf(model.drawn[0]?.points ?? []);
  if (extrema === null || extrema.peak.v === extrema.low.v) return [];
  const low = lowLabel(model, extrema.low);
  return [peakLabel(model, extrema.peak, low), low];
}
