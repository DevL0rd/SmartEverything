import { useAutomationsSource } from '../../data/source';
import { useMemo } from 'react';
import { notify } from '../../../../components/toast-store';
import { useStableCallback } from '../../../../design/use-stable-callback';
import type { DocumentStore } from '../../model/editor/document-store';
import type { EdgeEnd } from '../../model/graph/scene-contract';
import type { GraphPoint } from '../canvas/graph-canvas-types';
import type { HostActions } from '../host/host-actions';
import type { InsertPoint, ScreenPoint } from '../palette/armed-insert';
import { dropPinOf } from '../palette/pin-filter';

export interface HostActionsInput {
  readonly store: DocumentStore;
  readonly selecting: () => boolean;
  readonly onInsertPoint: (point: InsertPoint, anchor: ScreenPoint | null) => void;
  readonly onGroupSelection: (ids: readonly string[]) => void;
  readonly onAddTrigger: () => void;
  readonly onOpened: () => void;
  readonly onEscape: () => void;
}

export const DROP_REFUSED = 'That pin cannot start a new step. Drag from another pin.';

export const SPOT_GONE = 'That spot is not there any more. Pick another one.';

export function useHostActions(input: HostActionsInput): HostActions {
  const kinds = useAutomationsSource().lookup;
  const { store, selecting, onInsertPoint } = input;
  const group = useStableCallback(input.onGroupSelection);
  const addTrigger = useStableCallback(input.onAddTrigger);
  const opened = useStableCallback(input.onOpened);
  const escape = useStableCallback(input.onEscape);
  const openNode = useStableCallback((id: string): void => {
    if (selecting()) return;
    store.select(id);
    opened();
  });
  const open = useStableCallback(
    (from: EdgeEnd, at: GraphPoint | null, anchor: ScreenPoint | null, refused: string): void => {
      const pin = dropPinOf(store.state.get().program, from, kinds);
      if (pin === undefined) {
        notify({ message: refused });
        return;
      }
      onInsertPoint({ pin, at, filtered: true }, anchor);
    },
  );
  return useMemo<HostActions>(
    () => ({
      openNode,
      dropEmpty: (from, point, screen): void => {
        open(from, point, screen, DROP_REFUSED);
      },
      insertOnWire: (from): void => {
        open(from, null, null, SPOT_GONE);
      },
      stepPass: (): void => undefined,
      groupSelection: group,
      addTrigger,
      escape,
    }),
    [openNode, open, group, addTrigger, escape],
  );
}
