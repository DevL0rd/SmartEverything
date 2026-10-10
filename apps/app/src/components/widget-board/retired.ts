import { BOARD_CLASSES, type BoardLayout } from '@smarteverything/domain';
import type { BoardLayoutState } from './types';

function withoutTypes(layout: BoardLayout, retired: ReadonlySet<string>): BoardLayout {
  const classes: BoardLayout['classes'] = {};
  for (const board of BOARD_CLASSES) {
    const arrangement = layout.classes[board];
    if (arrangement !== undefined) {
      classes[board] = {
        ...arrangement,
        widgets: arrangement.widgets.filter((widget) => !retired.has(widget.type)),
      };
    }
  }
  return { ...layout, classes };
}

export function withoutRetired(
  state: BoardLayoutState,
  retired: ReadonlySet<string>,
): BoardLayoutState {
  return state.status === 'ready' && state.layout !== null
    ? { status: 'ready', layout: withoutTypes(state.layout, retired) }
    : state;
}
