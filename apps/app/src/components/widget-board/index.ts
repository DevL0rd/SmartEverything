export { WidgetBoard } from './board';
export { ActionBand, ActionBandTail } from './action-band';
export { useInActionBand } from './band-context';
export { tierHeight, tierInnerHeight, tierRows } from './tier';
export { useBoardEditor, type BoardEditor } from './edit/use-board-editor';
export { WIDGET_SURFACE, WidgetFrame, WidgetHeader, WidgetSurface } from './widget-frame';
export { widgetBodyHeight } from './widget-frame-metrics';
export {
  WidgetEmpty,
  WidgetGone,
  WidgetStat,
  WidgetStats,
  heroFigure,
  isTall,
  type WidgetStatProps,
} from './widget-parts';
export { renderWidget } from './widget-scope';
export type { BoardReveal } from './reveal';
export { boardClassOf } from './board-geometry';
export { frameClassOf, type FrameClass, type WidgetFrameBox } from './frame-class';
export { withoutRetired } from './retired';
export type {
  BoardClass,
  BoardDefaults,
  BoardLayoutState,
  BoardWidget,
  GalleryEntry,
  PickerState,
  TargetRow,
  TargetSection,
  WidgetDefinition,
  WidgetRenderProps,
  WidgetSize,
} from './types';
