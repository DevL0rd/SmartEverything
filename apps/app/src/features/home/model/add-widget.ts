import {
  BOARD_CLASSES,
  arrangementOf,
  withWidgetOverlaid,
  type BoardLayout,
  type BoardWidget,
} from '@smarteverything/domain';
import type { BoardDefaults } from '../../../components/widget-board';

export function withWidgetAdded(
  stored: BoardLayout,
  defaults: BoardDefaults,
  widget: BoardWidget,
): BoardLayout | null {
  let layout = stored;
  let changed = false;
  for (const board of BOARD_CLASSES) {
    const widgets = arrangementOf(layout, board, defaults);
    if (widgets.some((candidate) => candidate.key === widget.key)) continue;
    layout = withWidgetOverlaid(layout, board, widget);
    changed = true;
  }
  return changed ? layout : null;
}
