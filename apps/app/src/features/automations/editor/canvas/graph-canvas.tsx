'use dom';

import 'd3-transition';
import '@xyflow/react/dist/base.css';
import './canvas-frame.css';
import './pins/pins.css';
import './cards.css';
import './graph-canvas.css';
import './edges/edges.css';
import './connect/connect.css';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { background } from '@smarteverything/logging';
import { useStableCallback } from '../../../../design/use-stable-callback';
import type { GraphScene } from '../../model/graph/scene-contract';
import { loadCanvasFonts } from './canvas-fonts';
import { themeStyle } from './theme-vars';
import { ConnectHint, ConnectToast, useArmedAnnouncement } from './connect/connect-overlay';
import { useGraphFeedback } from './connect/connect-toast';
import { useGraphConnect, type GraphConnect } from './connect/use-graph-connect';
import { FLOW_PROPS } from './flow-props';
import type {
  GraphCanvasIntent,
  GraphCanvasProps,
  GraphFlowEdge,
  GraphFlowNode,
  GraphIdiom,
  GraphIntentFeedback,
} from './graph-canvas-types';
import { GraphEmitContext, GraphRunContext, GraphRunStore } from './graph-context';
import { LiveRegion, problemsMessage } from './keyboard/live-region';
import { withNames } from './keyboard/node-names';
import { useGraphKeys } from './keyboard/use-graph-keys';
import { measuredSizes } from './measure';
import { buildGraphEdges, buildGraphNodes, withSelection } from './scene-to-flow';
import { useFocusNode, useViewportCommand, useZoomAttributes } from './use-canvas-view';
import { useOpeningView } from './use-opening-view';
import { useRevealNode, useRevealSelection } from './use-reveal';
import { DropGhost, useRevealGhostSource } from './drop-ghost';
import { VISIBLE_ONLY_ABOVE, ZOOM_LIMITS, framedViewport, type GraphFraming } from './viewport';

const TOUCH_DRAG_THRESHOLD = 8;
const POINTER_DRAG_THRESHOLD = 3;
const NO_TAKEN: readonly string[] = [];

function selectionKey(ids: readonly string[]): string {
  return [...ids].sort().join(',');
}

function useRunStore(run: GraphCanvasProps['run']): GraphRunStore {
  const [store] = useState(() => new GraphRunStore());
  useEffect(() => {
    store.update(run);
  }, [store, run]);
  return store;
}

function freshNodes(scene: GraphScene, selection: readonly string[]): GraphFlowNode[] {
  return withSelection(withNames(buildGraphNodes(scene), scene), scene, selection);
}

interface GraphNodes {
  readonly nodes: GraphFlowNode[];
  readonly onNodesChange: (changes: NodeChange<GraphFlowNode>[]) => void;
}

function useGraphNodes(
  scene: GraphScene,
  selection: readonly string[],
  emit: (intent: GraphCanvasIntent) => void,
): GraphNodes {
  const wanted = selectionKey(selection);
  const [shown, setShown] = useState(() => ({ scene, wanted }));
  const [nodes, setNodes] = useState(() => freshNodes(scene, selection));
  if (shown.scene !== scene) {
    setShown({ scene, wanted });
    setNodes(freshNodes(scene, selection));
  } else if (shown.wanted !== wanted) {
    setShown({ scene, wanted });
    setNodes((current) => withSelection(current, scene, selection));
  }
  return {
    nodes,
    onNodesChange: (changes): void => {
      const next = applyNodeChanges(changes, nodes);
      setNodes(next);
      const sizes = measuredSizes(changes, nodes);
      if (sizes.length > 0) emit({ type: 'measured', sizes });
      if (!changes.some((change) => change.type === 'select')) return;
      const ids = next.filter((node) => node.selected === true).map((node) => node.id);
      if (selectionKey(ids) !== wanted) emit({ type: 'select', ids });
    },
  };
}

interface GraphEdges {
  readonly edges: GraphFlowEdge[];
  readonly wires: readonly string[];
  readonly onEdgesChange: (changes: EdgeChange<GraphFlowEdge>[]) => void;
}

function rebuiltEdges(
  scene: GraphScene,
  taken: readonly string[],
  previous: readonly GraphFlowEdge[],
): GraphFlowEdge[] {
  const chosen = new Set(previous.filter((edge) => edge.selected === true).map((edge) => edge.id));
  return buildGraphEdges(scene, taken).map((edge) =>
    chosen.has(edge.id) ? { ...edge, selected: true } : edge,
  );
}

function useGraphEdges(scene: GraphScene, taken: readonly string[]): GraphEdges {
  const [edges, setEdges] = useState(() => buildGraphEdges(scene, taken));
  const [basis, setBasis] = useState({ scene, taken });
  if (basis.scene !== scene || basis.taken !== taken) {
    setBasis({ scene, taken });
    setEdges(rebuiltEdges(scene, taken, edges));
  }
  return {
    edges,
    wires: edges.filter((edge) => edge.selected === true).map((edge) => edge.id),
    onEdgesChange: (changes): void => {
      setEdges((current) => applyEdgeChanges(changes, current));
    },
  };
}

function useProblemAnnouncements(count: number, announce: (text: string) => void): void {
  const [seen, setSeen] = useState(count);
  if (seen === count) return;
  setSeen(count);
  const text = problemsMessage(seen, count);
  if (text !== null) announce(text);
}

function useReady(
  root: RefObject<HTMLDivElement | null>,
  emit: (intent: GraphCanvasIntent) => void,
): void {
  useEffect(() => {
    const element = root.current;
    if (element === null) return undefined;
    let fontsReady = false;
    const report = (): void => {
      const { width, height } = element.getBoundingClientRect();
      if (!fontsReady || width <= 0 || height <= 0) return;
      emit({ type: 'ready', metrics: { width, height } });
    };
    const observer = new ResizeObserver(report);
    observer.observe(element);
    background(
      loadCanvasFonts().then(() => {
        fontsReady = true;
        report();
      }),
      'automations.canvas.fonts',
    );
    return (): void => {
      observer.disconnect();
    };
  }, [root, emit]);
}

function useIntentEmit(
  onIntent: GraphCanvasProps['onIntent'],
  show: (feedback: GraphIntentFeedback | null) => void,
  seen: (intent: GraphCanvasIntent) => void,
): (intent: GraphCanvasIntent) => void {
  const send = useStableCallback(onIntent);
  return useStableCallback((intent: GraphCanvasIntent): void => {
    seen(intent);
    background(send(intent).then(show), 'automations.canvas.intent', { intent: intent.type });
  });
}

interface SurfaceProps {
  readonly scene: GraphScene;
  readonly idiom: GraphIdiom;
  readonly framing: GraphFraming;
  readonly readOnly: boolean;
  readonly nodes: GraphNodes;
  readonly edges: GraphEdges;
  readonly connect: GraphConnect;
  readonly onNodeDragStop: (event: unknown, node: GraphFlowNode, moved: GraphFlowNode[]) => void;
  readonly onMoveEnd: () => void;
  readonly onMoveStart: (event: MouseEvent | TouchEvent | null) => void;
}

function FlowSurface({
  scene,
  idiom,
  framing,
  readOnly,
  nodes,
  edges,
  connect,
  onNodeDragStop,
  onMoveEnd,
  onMoveStart,
}: SurfaceProps): ReactNode {
  return (
    <ReactFlow<GraphFlowNode, GraphFlowEdge>
      nodes={nodes.nodes}
      edges={edges.edges}
      {...FLOW_PROPS}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      onNodesChange={nodes.onNodesChange}
      onEdgesChange={edges.onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      onMoveEnd={onMoveEnd}
      onMoveStart={onMoveStart}
      onConnectStart={connect.onConnectStart}
      onConnectEnd={connect.onConnectEnd}
      onClickCapture={connect.onTapCapture}
      onPaneClick={connect.onPaneClick}
      nodeDragThreshold={idiom === 'touch' ? TOUCH_DRAG_THRESHOLD : POINTER_DRAG_THRESHOLD}
      defaultViewport={framedViewport(
        scene,
        { width: window.innerWidth, height: window.innerHeight },
        idiom,
        framing,
      )}
      minZoom={ZOOM_LIMITS.min}
      maxZoom={ZOOM_LIMITS.max}
      panOnScroll={idiom === 'pointer'}
      onlyRenderVisibleElements={nodes.nodes.length > VISIBLE_ONLY_ABOVE}
    />
  );
}

function useDragStop(
  emit: (intent: GraphCanvasIntent) => void,
): (event: unknown, node: GraphFlowNode, moved: GraphFlowNode[]) => void {
  return useStableCallback((_event: unknown, _node: GraphFlowNode, moved: GraphFlowNode[]) => {
    const moves = moved.map(({ id, position }) => ({ id, x: position.x, y: position.y }));
    if (moves.length > 0) emit({ type: 'move', request: { kind: 'drag', moves } });
  });
}

function useViewEffects(
  root: RefObject<HTMLDivElement | null>,
  props: GraphCanvasProps,
  view: {
    readonly emit: (intent: GraphCanvasIntent) => void;
    readonly fit: () => Promise<boolean>;
  },
): void {
  const { emit, fit } = view;
  useZoomAttributes(root, props.idiom);
  useViewportCommand(props.viewportCommand, fit);
  useFocusNode(props.focusNode);
  useReady(root, emit);
  useRevealSelection(root, props.selection);
  useRevealGhostSource(props.ghost, useRevealNode(root));
}

function useSettled(emit: (intent: GraphCanvasIntent) => void): () => void {
  return useStableCallback((): void => {
    emit({ type: 'viewportSettled' });
  });
}

function useCanvasKeys(
  root: RefObject<HTMLDivElement | null>,
  props: GraphCanvasProps,
  parts: {
    readonly edges: GraphEdges;
    readonly connect: GraphConnect;
    readonly emit: (intent: GraphCanvasIntent) => void;
    readonly fit: () => Promise<boolean>;
  },
): ReturnType<typeof useGraphKeys> {
  return useGraphKeys({
    root,
    scene: props.scene,
    selection: props.selection,
    wires: parts.edges.wires,
    armed: parts.connect.armed !== null,
    emit: parts.emit,
    disarm: parts.connect.cancel,
    fit: parts.fit,
  });
}

function useAnnouncements(
  scene: GraphScene,
  connect: GraphConnect,
  announce: (text: string) => void,
): void {
  useProblemAnnouncements(scene.problems.length, announce);
  useArmedAnnouncement(connect.armed, scene.nodes, announce);
}

function GraphCanvasRoot(props: GraphCanvasProps): ReactNode {
  const { scene, idiom, active, run } = props;
  const root = useRef<HTMLDivElement>(null);
  const runs = useRunStore(run);
  const feedback = useGraphFeedback();
  const opening = useOpeningView(root, props);
  const emit = useIntentEmit(props.onIntent, feedback.show, opening.touched);
  const nodes = useGraphNodes(scene, props.selection, emit);
  const edges = useGraphEdges(scene, run?.taken ?? NO_TAKEN);
  const connect = useGraphConnect(root, idiom, emit, !props.readOnly);
  const onKeyDownCapture = useCanvasKeys(root, props, { edges, connect, emit, fit: opening.fit });
  const onNodeDragStop = useDragStop(emit);
  const onMoveEnd = useSettled(emit);
  useAnnouncements(scene, connect, feedback.announce);
  useViewEffects(root, props, { emit, fit: opening.fit });
  return (
    <GraphEmitContext value={emit}>
      <GraphRunContext value={runs}>
        <div
          ref={root}
          className={active ? 'se-flow gc-flow' : 'se-flow gc-flow paused'}
          data-idiom={idiom}
          data-live={run?.live === true}
          data-readonly={props.readOnly}
          style={themeStyle(props.theme)}
          onKeyDownCapture={onKeyDownCapture}
        >
          <FlowSurface
            {...{
              scene,
              idiom,
              framing: props.framing,
              readOnly: props.readOnly,
              nodes,
              edges,
              connect,
              onNodeDragStop,
              onMoveEnd,
              onMoveStart: opening.onMoveStart,
            }}
          />
          <DropGhost ghost={props.ghost} />
          <ConnectHint armed={connect.armed} nodes={scene.nodes} />
          <ConnectToast toast={feedback.state.toast} />
          <LiveRegion polite={feedback.state.polite} assertive={feedback.state.assertive} />
        </div>
      </GraphRunContext>
    </GraphEmitContext>
  );
}

export default function GraphCanvas(props: GraphCanvasProps): ReactNode {
  return (
    <ReactFlowProvider>
      <GraphCanvasRoot {...props} />
    </ReactFlowProvider>
  );
}
