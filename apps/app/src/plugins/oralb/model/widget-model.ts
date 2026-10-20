import type { BrushLiveFrame, BrushStateView } from '@smarteverything/domain';
import type { FrameClass } from '../../../components/widget-board';
import { QUARTER_COUNT } from './arch-model';
import { sectionCaption, sectionsOf, stageKindOf } from './stage-model';

export type WidgetLayout = 'compact' | 'column' | 'row' | 'report';

export function widgetLayoutOf(cls: FrameClass): WidgetLayout {
  switch (cls) {
    case 'xs':
    case 's':
    case 'm':
      return 'compact';
    case 'l':
      return 'column';
    case 'w':
      return 'row';
    case 'xl':
      return 'report';
  }
}

export function stepCaptionOf(view: BrushStateView, frame: BrushLiveFrame): string {
  const kind = stageKindOf(view, frame);
  if (kind === 'ring') {
    return 'Tongue Clean, one block';
  }
  if (kind === 'sections') {
    return sectionCaption(sectionsOf(view, frame));
  }
  return `Quarter ${String(frame.zone ?? 1)} of ${String(QUARTER_COUNT)}`;
}
