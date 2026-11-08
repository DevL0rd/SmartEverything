import { createElement } from 'react';
import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlow } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import type { ProgramV4 } from '@smarteverything/domain';
import { programSizes, ROW_H, STEP_MIN_H } from '@smarteverything/flow/graph/metrics';
import { pinRowsHeight } from '@smarteverything/flow/graph/pin-metrics';
import { automation, gnode, note, start } from '../../../model/graph/graph-scene-fixtures';
import { projectGraphScene } from '../../../model/graph/project-graph-scene';
import type { GraphScene, GraphSceneNode } from '../../../model/graph/scene-contract';
import { ERROR_EXIT_LABEL, latentErrorHandle } from '../../../model/graph/scene-exec';
import { GraphEmitContext, GraphRunContext, GraphRunStore } from '../graph-context';
import { GRAPH_NODE_TYPES } from '../node-registry';
import { cardHtml, handlesOf, renderScene } from '../render-support';
import { buildGraphEdges, buildGraphNodes } from '../scene-to-flow';
import { showsErrorHandle } from './step-card';

const ERROR_HANDLE = 'x:onError';

function program(): ProgramV4 {
  return automation([
    start('plain'),
    note('plain', 'wired'),
    note('wired', 'stop', { to: { next: 'stop', onError: 'rescue' } }),
    note('rescue'),
    gnode('stop', 'flow.stop'),
  ]);
}

function sceneOf(source: ProgramV4): GraphScene {
  return projectGraphScene(source, { direction: 'ltr', kinds: STATIC_KIND_LOOKUP });
}

function nodeOf(scene: GraphScene, key: string): GraphSceneNode {
  const found = scene.nodes.find((node) => node.key === key);
  if (found === undefined) throw new Error(`no scene node ${key}`);
  return found;
}

function renderSelected(scene: GraphScene, selectedId: string): string {
  const store = new GraphRunStore();
  const nodes = buildGraphNodes(scene).map((node) => ({
    ...node,
    selected: node.id === selectedId,
  }));
  const edges = buildGraphEdges(scene, []);
  const flow = createElement(ReactFlow, {
    nodes,
    edges,
    nodeTypes: GRAPH_NODE_TYPES,
    width: 2000,
    height: 2000,
  });
  const run = createElement(GraphRunContext, { value: store }, flow);
  return renderToStaticMarkup(createElement(GraphEmitContext, { value: () => undefined }, run));
}

describe('If it fails handle on step cards', () => {
  const scene = sceneOf(program());
  const plain = nodeOf(scene, 'plain');
  const wired = nodeOf(scene, 'wired');

  it('is offered on a fallible step whose error exit is not wired yet', () => {
    expect(latentErrorHandle(plain.kind, plain.rows, STATIC_KIND_LOOKUP)).toBe(ERROR_HANDLE);
    expect(latentErrorHandle(wired.kind, wired.rows, STATIC_KIND_LOOKUP)).toBeNull();
    expect(latentErrorHandle('flow.stop', [], STATIC_KIND_LOOKUP)).toBeNull();
    expect(latentErrorHandle('device.get', [], STATIC_KIND_LOOKUP)).toBeNull();
  });

  it('keeps an unwired card at its stored size and without an error row', () => {
    expect(plain.rows.map((row) => row.port)).toEqual(['next']);
    expect(plain.h).toBe(programSizes(program(), 'touch', STATIC_KIND_LOOKUP).get(plain.id)?.h);
    const source = program().nodes.find((node) => node.key === 'plain');
    if (source === undefined) throw new Error('no plain node');
    expect(plain.h).toBe(STEP_MIN_H + pinRowsHeight(source, new Set(), STATIC_KIND_LOOKUP));
  });

  it('turns into a labelled lane row once wired and the card grows by that row', () => {
    const row = wired.rows.find((candidate) => candidate.port === 'onError');
    expect(row).toMatchObject({ role: 'lane', label: ERROR_EXIT_LABEL, wired: true });
    expect(wired.h).toBe(plain.h + ROW_H.touch);
  });

  it('draws no extra handle while the card is neither selected nor hovered', () => {
    expect(handlesOf(renderScene(scene), plain.id)).not.toContain(ERROR_HANDLE);
  });

  it('draws the compact handle on a selected card so a tap or drag can start the wire', () => {
    const html = renderSelected(scene, plain.id);
    expect(handlesOf(html, plain.id)).toContain(ERROR_HANDLE);
    const card = cardHtml(html, plain.id);
    expect(card).toContain('gc-error-handle');
    expect(card).toContain(`>${ERROR_EXIT_LABEL}<`);
  });

  it('never draws a second error handle next to the wired row', () => {
    const drawn = handlesOf(renderSelected(scene, wired.id), wired.id);
    expect(drawn.filter((handle) => handle === ERROR_HANDLE)).toHaveLength(1);
    expect(cardHtml(renderSelected(scene, wired.id), wired.id)).not.toContain('gc-error-handle');
  });

  it('shows while selected, hovered or dragging from it', () => {
    const off = { selected: false, hovered: false, dragging: false };
    expect(showsErrorHandle(off)).toBe(false);
    expect(showsErrorHandle({ ...off, selected: true })).toBe(true);
    expect(showsErrorHandle({ ...off, hovered: true })).toBe(true);
    expect(showsErrorHandle({ ...off, dragging: true })).toBe(true);
  });
});
