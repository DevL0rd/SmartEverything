import { renderToStaticMarkup } from 'react-dom/server';
import { Position, ReactFlowProvider, type EdgeProps } from '@xyflow/react';
import type { GraphScene, GraphSceneEdge } from '../../../model/graph/scene-contract';
import type { GraphFlowEdge } from '../graph-canvas-types';
import { GraphEmitContext } from '../graph-context';
import { buildGraphNodes } from '../scene-to-flow';
import { ExecEdge } from './exec-edge';
import { ValueEdge } from './value-edge';

const SIZE = 2000;
const SOURCE_Y = 50;

function propsOf(edge: GraphSceneEdge, dy: number): EdgeProps<GraphFlowEdge> {
  return {
    id: edge.id,
    source: edge.source.nodeId,
    target: edge.target.nodeId,
    sourceHandleId: edge.source.handle,
    targetHandleId: edge.target.handle,
    sourceX: 100,
    sourceY: SOURCE_Y,
    targetX: 300,
    targetY: SOURCE_Y + dy,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: { scene: edge, points: null, around: [], wires: [], shift: 0 },
    selected: false,
    animated: false,
    selectable: true,
    deletable: true,
    interactionWidth: 44,
    type: edge.kind,
  };
}

export function renderWire(scene: GraphScene, edge: GraphSceneEdge, dy: number): string {
  const props = propsOf(edge, dy);
  return renderToStaticMarkup(
    <GraphEmitContext value={() => undefined}>
      <ReactFlowProvider
        initialNodes={buildGraphNodes(scene)}
        initialWidth={SIZE}
        initialHeight={SIZE}
      >
        <svg>{edge.kind === 'exec' ? <ExecEdge {...props} /> : <ValueEdge {...props} />}</svg>
      </ReactFlowProvider>
    </GraphEmitContext>,
  );
}
