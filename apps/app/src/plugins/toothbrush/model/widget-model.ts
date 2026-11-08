import type { BrushLiveFrame, BrushStateView } from '@smarteverything/domain';
import type { FrameClass, WidgetFrameBox } from '../../../components/widget-board';
import {
  WIDGET_BODY_GAP,
  widgetHeaderHeight,
} from '../../../components/widget-board/widget-frame-metrics';
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
  return Math.max(0, frame.height - widgetHeaderHeight(frame.idiom) - WIDGET_BODY_GAP);
}

export function ringPxOf(bodyHeight: number): number {
  return Math.min(128, Math.max(72, bodyHeight - 8));
}
