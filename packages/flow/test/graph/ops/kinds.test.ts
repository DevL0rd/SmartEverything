import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import {
  NODE_REGISTRY,
  defineNodeKind,
  type NodeKind,
  type NodeKindLookup,
  type ProgramV4,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { canConnect } from '../../../src/graph/ops/can-connect';
import { automation, graphNode, start } from '../graph-fixtures';
import { nodeAt, ok, refused, toOf } from './support';

const PLUGIN_STEP = 'plugin.demo.go';

const WAITING_ONLY = 'plugin.demo.ask';

function declared(id: string, extra: Partial<NodeKind> = {}): NodeKind {
  const base = NODE_REGISTRY.get('device.set');
  if (base === undefined) throw new Error('device.set is not registered');
  return defineNodeKind({ ...base, id, ...extra });
}

const LIVE = new Map<string, NodeKind>([
  [PLUGIN_STEP, declared(PLUGIN_STEP)],
  [
    WAITING_ONLY,
    declared(WAITING_ONLY, { modes: { default: 'wait_for_result', allowed: ['wait_for_result'] } }),
  ],
]);

const kinds: NodeKindLookup = {
  get: (id) => LIVE.get(id) ?? NODE_REGISTRY.get(id),
  has: (id) => LIVE.has(id) || NODE_REGISTRY.has(id),
};

function pluginProgram(): ProgramV4 {
  return automation([
    start('go'),
    graphNode('go', PLUGIN_STEP),
    graphNode('then', PLUGIN_STEP),
    graphNode('ask', WAITING_ONLY),
  ]);
}

describe('patch operations on plugin kinds', () => {
  it('connects plugin steps when the live kinds are given and refuses without them', () => {
    const program = pluginProgram();
    const op = { op: 'connect', from: 'go', port: 'next', to: 'then' } as const;
    expect(toOf(ok(program, [op], { kinds, allowProblems: true }).program, 'go', 'next')).toBe(
      'then',
    );
    expect(refused(program, [op]).code).toBe('cannot_connect');
  });

  it('says whether a plugin step may lead to another from the live kinds', () => {
    const program = pluginProgram();
    expect(canConnect(program, { from: 'go', port: 'next', to: 'then' }, kinds)).toEqual({
      ok: true,
    });
    expect(
      canConnect(program, { from: 'go', port: 'next', to: 'then' }, STATIC_KIND_LOOKUP),
    ).toMatchObject({
      ok: false,
      reason: 'value_to_exec',
    });
  });

  it('holds a plugin step to the run modes its kind offers', () => {
    const program = pluginProgram();
    const wait = { op: 'set', key: 'ask', mode: 'fire_and_forget' } as const;
    expect(refused(program, [wait], { kinds }).code).toBe('not_allowed');
    expect(
      nodeAt(ok(program, [wait], { kinds: STATIC_KIND_LOOKUP, allowProblems: true }).program, 'ask')
        .policy?.mode,
    ).toBe('fire_and_forget');
  });

  it('lets a plugin step leave through its error exit when its kind can fail', () => {
    const program = pluginProgram();
    const route = { op: 'connect', from: 'go', port: 'onError', to: 'then' } as const;
    const done = ok(program, [route], { kinds, allowProblems: true });
    expect(toOf(done.program, 'go', 'onError')).toBe('then');
    expect(refused(program, [route]).code).toBe('unknown_port');
  });
});
