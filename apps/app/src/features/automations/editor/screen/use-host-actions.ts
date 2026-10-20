import { useMemo } from 'react';
import { Dimensions } from 'react-native';
import type { Layout } from '@smarteverything/domain';
import type { Program } from '@smarteverything/flow/program/walk';
import { notify } from '../../../../components/toast-store';
import { useStableCallback } from '../../../../design/use-stable-callback';
import type { InsertPoint, Scene } from '../../model/canvas/contract';
import { projectScene } from '../../model/canvas/project-scene';
import { TRIGGER_GROUP_ID } from '../../model/canvas/tree-draft';
import type { DocumentStore } from '../../model/editor/document-store';
import { sizeClassFor } from '../canvas/viewport';
import type { HostActions } from '../host/intent-env';
import type { SceneOptions } from '../host/use-canvas-props';
import { findInsertPoint, SPOT_GONE, type InsertTarget } from './insert-point';

export interface HostActionsInput {
  readonly store: DocumentStore;
  readonly options: SceneOptions;
  readonly canvasWidth: () => number;
  readonly selecting: () => boolean;
  readonly onInsertPoint: (point: InsertPoint | null) => void;
  readonly onGroupSelection: (ids: readonly string[]) => void;
  readonly onHeader: () => void;
}

function sceneAt(program: Program, layout: Layout, options: SceneOptions, width: number): Scene {
  const mode = sizeClassFor(width);
  return projectScene(program, {
    ...options,
    layout,
    mode,
    ...(mode === 'compact' ? { canvasWidth: width } : {}),
  });
}

export function windowWidth(): number {
  return Dimensions.get('window').width;
}

export function useHostActions(input: HostActionsInput): HostActions {
  const { store, options, canvasWidth, selecting, onInsertPoint, onGroupSelection, onHeader } =
    input;
  const insertAt = useStableCallback((target: InsertTarget): void => {
    const { program, layout } = store.state.get();
    const point = findInsertPoint(sceneAt(program, layout, options, canvasWidth()), target);
    if (point === null) {
      notify({ message: SPOT_GONE });
      return;
    }
    onInsertPoint(point);
  });
  const openNode = useStableCallback((id: string): void => {
    if (id === TRIGGER_GROUP_ID) onHeader();
    else if (!selecting()) store.select(id);
  });
  const group = useStableCallback(onGroupSelection);
  return useMemo<HostActions>(
    () => ({
      openNode,
      insertOnEdge: (edgeId): void => {
        insertAt({ kind: 'edge', edgeId });
      },
      openSlot: (slotId): void => {
        insertAt({ kind: 'slot', slotId });
      },
      portDropEmpty: (): void => {
        onInsertPoint(null);
      },
      groupSelection: group,
      viewportSettled: (): void => undefined,
      refused: (reason): void => {
        notify({ message: reason });
      },
    }),
    [openNode, insertAt, group, onInsertPoint],
  );
}
