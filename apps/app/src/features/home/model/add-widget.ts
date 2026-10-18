import {
  BOARD_CLASSES,
  BOARD_LAYOUT_VERSION,
  withArrangementFor,
  type BoardLayout,
  type BoardWidget,
} from '@smarteverything/domain';
import type { BoardDefaults } from '../../../components/widget-board';

export function withWidgetAdded(
  stored: BoardLayout,
  defaults: BoardDefaults,
  widget: BoardWidget,
): BoardLayout | null {
  let layout: BoardLayout = { version: BOARD_LAYOUT_VERSION, classes: { ...stored.classes } };
  let changed = false;
  for (const board of BOARD_CLASSES) {
    const widgets = layout.classes[board]?.widgets ?? defaults[board];
    if (widgets.some((candidate) => candidate.key === widget.key)) continue;
    layout = withArrangementFor(layout, board, { widgets: [...widgets, widget] });
    changed = true;
  }
  return changed ? layout : null;
}
