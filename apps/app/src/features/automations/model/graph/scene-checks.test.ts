import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PROGRAM_V3, STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { unstructure } from '@smarteverything/flow/graph/unstructure';
import {
  admitProgram,
  blockProgram,
  brokenProgram,
  decisionProgram,
  earlyEndProgram,
  failureProgram,
  forkProgram,
  guardProgram,
  inputsProgram,
  lastItemProgram,
  laneRowsProgram,
  loopProgram,
  switchProgram,
  tryProgram,
  unknownTargetProgram,
} from './graph-scene-fixtures';
import { projectGraphScene } from './project-graph-scene';
import type { GraphScene } from './scene-contract';
import { duplicateEdgeIds, duplicateHandles, sceneEdgeHandleProblems } from './scene-checks';

const FIXTURES = fileURLToPath(
  new URL('../../../../../../../packages/flow/test/graph/fixtures/', import.meta.url),
);

function liveShapeScenes(direction: 'ltr' | 'ttb'): readonly (readonly [string, GraphScene])[] {
  return readdirSync(FIXTURES)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const json: unknown = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
      const program = unstructure(PROGRAM_V3.parse(json), STATIC_KIND_LOOKUP);
      return [name, projectGraphScene(program, { direction, kinds: STATIC_KIND_LOOKUP })] as const;
    });
}

const BUILT = [
  decisionProgram(),
  earlyEndProgram(),
  switchProgram(),
  guardProgram(),
  forkProgram('all'),
  forkProgram('settled'),
  loopProgram(),
  lastItemProgram(),
  tryProgram(),
  laneRowsProgram(),
  inputsProgram(),
  admitProgram(),
  failureProgram(),
  brokenProgram(),
  unknownTargetProgram(),
  blockProgram(14),
];

describe('scene edge ends', () => {
  it('finds a declared handle for every edge end of every built shape in both directions', () => {
    for (const program of BUILT) {
      for (const direction of ['ltr', 'ttb'] as const) {
        const scene = projectGraphScene(program, { direction, kinds: STATIC_KIND_LOOKUP });
        expect(scene.edges.length).toBeGreaterThan(0);
        expect(sceneEdgeHandleProblems(scene)).toEqual([]);
        expect(duplicateHandles(scene)).toEqual([]);
        expect(duplicateEdgeIds(scene)).toEqual([]);
      }
    }
  });

  it('finds a declared handle for every edge end of every live-shape fixture', () => {
    const scenes = liveShapeScenes('ltr');
    expect(scenes.length).toBeGreaterThanOrEqual(15);
    for (const [path, scene] of scenes) {
      expect(sceneEdgeHandleProblems(scene), path).toEqual([]);
      expect(duplicateHandles(scene), path).toEqual([]);
    }
    for (const [path, scene] of liveShapeScenes('ttb')) {
      expect(sceneEdgeHandleProblems(scene), path).toEqual([]);
    }
  });

  it('draws the value wires of the live-shape fixtures that read a loop value or a condition', () => {
    const wires = liveShapeScenes('ltr').flatMap(([, scene]) =>
      scene.edges.filter((edge) => edge.kind === 'value'),
    );
    const handles = wires.map((edge) => edge.target.handle);
    expect(handles.some((handle) => /^v:(row|case):.+:when$/.test(handle))).toBe(true);
    expect(wires.some((edge) => edge.source.handle === 'o:item')).toBe(true);
  });

  it('reports an edge end whose handle the node does not declare', () => {
    const scene = projectGraphScene(decisionProgram(), {
      direction: 'ltr',
      kinds: STATIC_KIND_LOOKUP,
    });
    const value = scene.edges.findIndex((edge) => edge.kind === 'value');
    const exec = scene.edges.findIndex((edge) => edge.kind === 'exec');
    const edges = scene.edges.map((edge, index) => {
      if (index === value)
        return { ...edge, target: { ...edge.target, handle: 'v:row:nope:when' } };
      if (index === exec) return { ...edge, source: { ...edge.source, handle: 'x:ghost' } };
      return edge;
    });
    const problems = sceneEdgeHandleProblems({ ...scene, edges });
    expect(problems.map((problem) => [problem.end, problem.handle, problem.reason])).toEqual([
      ['source', 'x:ghost', 'no handle'],
      ['target', 'v:row:nope:when', 'no handle'],
    ]);
  });

  it('reports an exec end that uses a value handle and an edge to a missing node', () => {
    const scene = projectGraphScene(decisionProgram(), {
      direction: 'ltr',
      kinds: STATIC_KIND_LOOKUP,
    });
    const [first] = scene.edges;
    if (first === undefined) throw new Error('no edge');
    const crossed = { ...first, target: { ...first.target, handle: 'v:message' } };
    const missing = { ...first, id: 'other', target: { nodeId: 'gone', handle: 'x:in' } };
    const problems = sceneEdgeHandleProblems({ ...scene, edges: [crossed, missing] });
    expect(problems.map((problem) => problem.reason)).toEqual(['no handle', 'no node']);
  });

  it('reports a handle declared twice on one node', () => {
    const scene = projectGraphScene(decisionProgram(), {
      direction: 'ltr',
      kinds: STATIC_KIND_LOOKUP,
    });
    const [first] = scene.nodes;
    if (first === undefined) throw new Error('no node');
    const doubled = { ...first, rows: [...first.rows, ...first.rows] };
    expect(duplicateHandles({ ...scene, nodes: [doubled] }).length).toBeGreaterThan(0);
  });
});
