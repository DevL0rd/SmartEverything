import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import type { GraphRunOverlay } from '../../model/graph/run-overlay';
import type { GraphScene } from '../../model/graph/scene-contract';
import { CommandLedger } from '../../../../store/command-ledger';
import type { EntityStore } from '../../../../store/entity-store';
import { StoreContext } from '../../../../store/store-runtime';
import { GraphEmitContext, GraphRunContext, GraphRunStore } from './graph-context';
import { GRAPH_NODE_TYPES } from './node-registry';
import { buildGraphEdges, buildGraphNodes } from './scene-to-flow';

const SIZE = 2000;

export function renderScene(
  scene: GraphScene,
  run: GraphRunOverlay | null = null,
  emit: () => void = () => undefined,
  entities: EntityStore | null = null,
): string {
  const store = new GraphRunStore();
  store.update(run);
  const nodes = buildGraphNodes(scene);
  const edges = buildGraphEdges(scene, run?.taken ?? []);
  const runtime =
    entities === null ? null : { store: entities, ledger: new CommandLedger(entities) };
  return renderToStaticMarkup(
    <StoreContext value={runtime}>
      <GraphEmitContext value={emit}>
        <GraphRunContext value={store}>
          <ReactFlowProvider
            initialNodes={nodes}
            initialEdges={edges}
            initialWidth={SIZE}
            initialHeight={SIZE}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={GRAPH_NODE_TYPES}
              width={SIZE}
              height={SIZE}
            />
          </ReactFlowProvider>
        </GraphRunContext>
      </GraphEmitContext>
    </StoreContext>,
  );
}

export function handlesOf(html: string, nodeId: string): readonly string[] {
  const tags = html.match(/<div[^>]*react-flow__handle[^>]*>/g) ?? [];
  return tags
    .filter((tag) => tag.includes(`data-nodeid="${nodeId}"`))
    .flatMap((tag) => {
      const found = /data-handleid="([^"]+)"/.exec(tag);
      return found?.[1] === undefined ? [] : [found[1]];
    });
}

export function cardHtml(html: string, nodeId: string): string {
  const start = html.indexOf(`data-id="${nodeId}"`);
  if (start < 0) return '';
  const next = html.indexOf('class="react-flow__node ', start + 1);
  return html.slice(start, next < 0 ? undefined : next);
}
