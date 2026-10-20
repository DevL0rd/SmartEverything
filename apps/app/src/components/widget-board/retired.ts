import { BOARD_CLASSES, type BoardLayout } from '@smarteverything/domain';
import type { BoardLayoutState } from './types';

function withoutTypes(layout: BoardLayout, retired: ReadonlySet<string>): BoardLayout {
  const without = (source: BoardLayout['classes']): BoardLayout['classes'] => {
    const kept: BoardLayout['classes'] = {};
    for (const board of BOARD_CLASSES) {
      const arrangement = source[board];
      if (arrangement !== undefined) {
        kept[board] = {
          ...arrangement,
          widgets: arrangement.widgets.filter((widget) => !retired.has(widget.type)),
        };
      }
    }
    return kept;
  };
  return {
    ...layout,
    classes: without(layout.classes),
    ...(layout.added === undefined ? {} : { added: without(layout.added) }),
  };
}

export function withoutRetired(
  state: BoardLayoutState,
  retired: ReadonlySet<string>,
): BoardLayoutState {
  return state.status === 'ready' && state.layout !== null
    ? { status: 'ready', layout: withoutTypes(state.layout, retired) }
    : state;
}
