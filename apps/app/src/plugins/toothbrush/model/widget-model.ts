import type { BrushLiveFrame, BrushStateView } from '@smarteverything/domain';
import type { FrameClass, WidgetFrameBox } from '../../../components/widget-board';
import type { VisualPx } from '../../../features/device-visuals';
import { clockText, isBrushingNow, modeLabel } from './brush-model';

export type LiveWidgetKind = 'brushing' | 'recap' | 'asleep' | 'private';

export function liveKind(view: BrushStateView, frame: BrushLiveFrame): LiveWidgetKind {
  if (isBrushingNow(frame.activity)) {
    return view.mine || frame.detailVisible ? 'brushing' : 'private';
  }
  if (!view.mine) {
    return 'private';
  }
  return view.lastSession === null ? 'asleep' : 'recap';
}

export function liveCaption(view: BrushStateView, frame: BrushLiveFrame): string {
  switch (liveKind(view, frame)) {
    case 'brushing':
      return `${modeLabel(frame.mode)} · ${clockText(frame.elapsedS)} of ${clockText(frame.routineS ?? 120)}`;
    case 'recap':
      return view.lastSession === null
        ? ''
        : `${modeLabel(view.lastSession.mode)} · ${clockText(view.lastSession.durationS)}`;
    case 'private':
      return view.personName === null
        ? 'Sessions are private'
        : `Sessions belong to ${view.personName}`;
    case 'asleep':
      return 'Brush once near your phone';
  }
}

export function batteryWord(view: BrushStateView): string {
  const { battery } = view;
  if (battery.percent === null) {
    return '–';
  }
  return `${String(Math.round(battery.percent))}%`;
}

export type LiveFace = 'strip' | 'row' | 'panel';

const HEADER_TOUCH = 40;
const HEADER_POINTER = 32;
const BODY_GAP = 12;
const SMALL_VISUAL = 72;
const SMALLEST_VISUAL = 48;

export function liveFaceOf(cls: FrameClass): LiveFace {
  switch (cls) {
    case 'xs':
    case 's':
    case 'm':
    case 'l':
      return 'strip';
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

const VISUAL_PX: Readonly<Record<LiveFace, VisualPx>> = { strip: 72, row: 96, panel: 128 };

export function visualPxOf(face: LiveFace, bodyHeight: number): VisualPx {
  const wanted = VISUAL_PX[face];
  if (bodyHeight >= wanted) {
    return wanted;
  }
  return bodyHeight >= SMALL_VISUAL ? SMALL_VISUAL : SMALLEST_VISUAL;
}

export function ringPxOf(bodyHeight: number): number {
  return Math.min(128, Math.max(72, bodyHeight - 8));
}
