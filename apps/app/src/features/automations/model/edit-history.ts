import { AUTOMATION_TREE_HISTORY_LIMIT } from '@smarteverything/domain';

export interface EditHistory<T> {
  readonly present: T;
  readonly past: readonly T[];
  readonly future: readonly T[];
}
export type EditHistoryChange<T> =
  | { readonly type: 'set'; readonly value: T }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' };
export function editHistory<T>(
  state: EditHistory<T>,
  change: EditHistoryChange<T>,
): EditHistory<T> {
  switch (change.type) {
    case 'set':
      return change.value === state.present
        ? state
        : {
            present: change.value,
            past: [...state.past, state.present].slice(-AUTOMATION_TREE_HISTORY_LIMIT),
            future: [],
          };
    case 'undo': {
      const present = state.past.at(-1);
      return present === undefined
        ? state
        : { present, past: state.past.slice(0, -1), future: [state.present, ...state.future] };
    }
    case 'redo': {
      const present = state.future[0];
      return present === undefined
        ? state
        : { present, past: [...state.past, state.present], future: state.future.slice(1) };
    }
  }
}
