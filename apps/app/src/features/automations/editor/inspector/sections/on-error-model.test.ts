import { describe, expect, it } from 'vitest';
import type { GraphNode, ProgramV4 } from '@smarteverything/domain';
import { NODE_REGISTRY, STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { applyPatch } from '@smarteverything/flow/graph/ops/reducer';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { unstructure } from '@smarteverything/flow/graph/unstructure';
import { Ids, automation, setLight } from '../../../model/canvas/canvas-fixtures';
import { ERROR_VALUE_ROWS, ON_ERROR_COPY, armOps, hasOnError, onErrorView } from './on-error-model';

function patched(graph: ProgramV4, ops: readonly PatchOp[]): ProgramV4 {
  const result = applyPatch(graph, ops, {
    kinds: STATIC_KIND_LOOKUP,
    newId: () => crypto.randomUUID(),
    allowProblems: true,
  });
  if (!result.ok) throw new Error(`the patch was refused: ${result.reason}`);
  return result.program;
}

function nodeOf(graph: ProgramV4, key: string): GraphNode {
  const node = graph.nodes.find((item) => item.key === key);
  if (node === undefined) throw new Error(`no node ${key}`);
  return node;
}

function twoLights(): ProgramV4 {
  const ids = new Ids();
  return unstructure(automation([setLight(ids, null), setLight(ids, null)]), STATIC_KIND_LOOKUP);
}

describe('which steps get On error', () => {
  it('is shown for steps that can fail and not for Try, values or plain flow', () => {
    expect(hasOnError('device.set', NODE_REGISTRY)).toBe(true);
    expect(hasOnError('flow.try', NODE_REGISTRY)).toBe(false);
    expect(hasOnError('math.add', NODE_REGISTRY)).toBe(false);
  });
});

describe('If it fails exit', () => {
  it('starts unconnected and not armed', () => {
    const graph = twoLights();
    const view = onErrorView(graph, nodeOf(graph, 'n1'), STATIC_KIND_LOOKUP);
    expect(view.armed).toBe(false);
    expect(view.target).toBeUndefined();
    expect(view.statusText).toBe(ON_ERROR_COPY.notConnected);
  });

  it('arms the exit for wiring by routing failures to it', () => {
    const graph = twoLights();
    const ops = armOps(nodeOf(graph, 'n1'));
    expect(ops).toEqual([{ op: 'set', key: 'n1', policy: { onError: 'route' } }]);
    const armed = patched(graph, ops);
    const view = onErrorView(armed, nodeOf(armed, 'n1'), STATIC_KIND_LOOKUP);
    expect(view.armed).toBe(true);
    expect(view.target).toBeUndefined();
  });

  it('names the step it goes to once connected', () => {
    const graph = twoLights();
    const armed = patched(graph, armOps(nodeOf(graph, 'n1')));
    const wired = patched(armed, [
      { op: 'disconnect', from: 'n1', port: 'next' },
      { op: 'connect', from: 'n1', port: 'onError', to: 'n2' },
    ]);
    const view = onErrorView(wired, nodeOf(wired, 'n1'), STATIC_KIND_LOOKUP);
    expect(view.target?.key).toBe('n2');
    expect(view.statusText).toBe(`If it fails goes to ${view.target?.name ?? ''}`);
  });

  it('says an unconnected exit follows When it fails in More options', () => {
    expect(ON_ERROR_COPY.fallback).toContain('When it fails');
    expect(ON_ERROR_COPY.fallback).toContain('More options');
  });

  it('lists the error values the exit carries', () => {
    expect(ERROR_VALUE_ROWS.map((row) => row.title)).toEqual(['Reason', 'Message', 'Code']);
    expect(ERROR_VALUE_ROWS.every((row) => row.description.length > 0)).toBe(true);
  });
});
