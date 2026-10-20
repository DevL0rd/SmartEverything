import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ReactFlow, SelectionMode, type ReactFlowProps } from '@xyflow/react';
import { useStableCallback } from '../../../../design/use-stable-callback';
import { CANVAS_ARIA_LABELS } from './aria-labels';
import type { CanvasEdge, CanvasNode, FlowCanvasProps } from './canvas-types';
import { EDGE_TYPES, NODE_TYPES } from './registry';
import { RunStore, RunStoreContext } from './run-store';
import { useCanvasIntents, useEmit } from './use-canvas-intents';
import { useCanvasKeys } from './use-canvas-keys';
import { useCanvasState } from './use-canvas-state';
import {
  useFocusNode,
  useOpeningViewport,
  useReady,
  useViewportCommand,
  useZoomAttributes,
} from './use-canvas-view';
import { themeStyle } from './theme-vars';
import { VISIBLE_ONLY_ABOVE, openingViewport, zoomLimits } from './viewport';

const CONNECT_RADIUS = 40;

const FLOW_PROPS: Partial<ReactFlowProps<CanvasNode, CanvasEdge>> = {
  nodeTypes: NODE_TYPES,
  edgeTypes: EDGE_TYPES,
  nodesFocusable: true,
  edgesFocusable: false,
  ariaLabelConfig: CANVAS_ARIA_LABELS,
  panOnDrag: true,
  zoomOnScroll: false,
  zoomOnPinch: true,
  zoomOnDoubleClick: false,
  selectionKeyCode: 'Shift',
  multiSelectionKeyCode: ['Control', 'Meta'],
  selectionMode: SelectionMode.Partial,
  connectOnClick: true,
  connectionRadius: CONNECT_RADIUS,
  deleteKeyCode: null,
};

function useRunStore(run: FlowCanvasProps['run']): RunStore {
  const [store] = useState(() => new RunStore());
  useEffect(() => {
    store.update(run ?? {});
  }, [store, run]);
  return store;
}

export function CanvasRoot(props: FlowCanvasProps): ReactNode {
  const { scene, idiom, active, onIntent } = props;
  const root = useRef<HTMLDivElement>(null);
  const runs = useRunStore(props.run);
  const send = useStableCallback(onIntent);
  const emit = useEmit(send);
  const select = useStableCallback((ids: readonly string[]): void => {
    emit({ type: 'select', ids: [...ids] });
  });
  const { flow, nodes, onNodesChange } = useCanvasState(scene, props.selection, select);
  const handlers = useCanvasIntents(emit, flow, idiom);
  useViewportCommand(props.viewportCommand);
  useFocusNode(props.focusNode);
  useOpeningViewport(scene, props.focusNode);
  useZoomAttributes(root, idiom);
  useReady(root, send);
  useCanvasKeys(send, active, scene);
  const limits = zoomLimits(scene.mode);
  return (
    <RunStoreContext value={runs}>
      <div
        ref={root}
        className={active ? 'se-flow' : 'se-flow paused'}
        data-idiom={idiom}
        data-mode={scene.mode}
        style={themeStyle(props.theme)}
      >
        <ReactFlow<CanvasNode, CanvasEdge>
          nodes={nodes}
          edges={flow.edges}
          {...FLOW_PROPS}
          onNodesChange={onNodesChange}
          defaultViewport={openingViewport(scene)}
          minZoom={limits.min}
          maxZoom={limits.max}
          panOnScroll={idiom === 'pointer'}
          onlyRenderVisibleElements={flow.nodes.length > VISIBLE_ONLY_ABOVE}
          {...handlers}
        />
      </div>
    </RunStoreContext>
  );
}
