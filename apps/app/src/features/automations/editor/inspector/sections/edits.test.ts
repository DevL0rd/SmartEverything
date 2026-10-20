import { describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import { Ids, automation, scope, setLight } from '../../../model/canvas/canvas-fixtures';
import {
  enabledOps,
  labelOps,
  noteOps,
  outputsOps,
  policyOps,
  portOps,
  renameOps,
  renameProblem,
  swapKindOps,
} from './edits';
import { applied, viewByKey } from './inspector-fixtures';

function nodeOf(program: Program, key: string): FlowNode {
  const entry = indexProgram(program).byKey.get(key);
  if (entry?.kind !== 'node') throw new Error(`no node ${key}`);
  return entry.node;
}

describe('label, note and enabled', () => {
  const ids = new Ids();
  const program = automation([
    setLight(ids, null, { label: 'Old', note: 'Careful', enabled: false }),
  ]);

  it('sets a label and clears it when the text is blank', () => {
    expect(nodeOf(applied(program, labelOps('n1', '  New  ')), 'n1').label).toBe('New');
    expect(nodeOf(applied(program, labelOps('n1', '   ')), 'n1').label).toBeUndefined();
  });

  it('sets a note and clears it when blank', () => {
    expect(nodeOf(applied(program, noteOps('n1', 'Line one\nLine two')), 'n1').note).toBe(
      'Line one\nLine two',
    );
    expect(nodeOf(applied(program, noteOps('n1', '')), 'n1').note).toBeUndefined();
  });

  it('turns a step on by removing the flag and off by writing false', () => {
    expect(nodeOf(applied(program, enabledOps('n1', true)), 'n1').enabled).toBeUndefined();
    const on = applied(program, enabledOps('n1', true));
    expect(nodeOf(applied(on, enabledOps('n1', false)), 'n1').enabled).toBe(false);
  });
});

describe('ports, policy, outputs and filter', () => {
  const ids = new Ids();
  const program = automation([setLight(ids, null)]);

  it('writes and removes a port', () => {
    const written = applied(program, portOps('n1', 'to', { lit: 10 }));
    expect(nodeOf(written, 'n1').ports?.['to']).toEqual({ lit: 10 });
    const removed = applied(written, portOps('n1', 'to', null));
    expect(nodeOf(removed, 'n1').ports?.['to']).toBeUndefined();
  });

  it('writes a policy and clears it with null', () => {
    const written = applied(program, policyOps('n1', { onError: 'continue', timeout: 5000 }));
    expect(nodeOf(written, 'n1').policy).toEqual({ onError: 'continue', timeout: 5000 });
    expect(nodeOf(applied(written, policyOps('n1', null)), 'n1').policy).toBeUndefined();
  });

  it('turns an empty structured output list into a clear', () => {
    expect(outputsOps('x', [])).toEqual([{ op: 'set', key: 'x', outputs: null }]);
    expect(outputsOps('x', [{ name: 'level', values: { else: { lit: 1 } } }])).toEqual([
      { op: 'set', key: 'x', outputs: [{ name: 'level', values: { else: { lit: 1 } } }] },
    ]);
  });
});

describe('rename', () => {
  const ids = new Ids();
  const program = automation([setLight(ids, null), setLight(ids, 'n1.value')]);

  it('renames a key and rewrites the formulas that read it', () => {
    const renamed = applied(program, renameOps('n1', 'lamp'));
    expect(nodeOf(renamed, 'lamp').kind).toBe('device.set');
    expect(nodeOf(renamed, 'n2').ports?.['to']).toEqual({ wire: { from: 'lamp', port: 'value' } });
  });

  it('explains why a key cannot be used and accepts the current key', () => {
    expect(renameProblem(program, 'n1', 'n2')).toBeDefined();
    expect(renameProblem(program, 'n1', 'run')).toBeDefined();
    expect(renameProblem(program, 'n1', 'n1')).toBeUndefined();
    expect(renameProblem(program, 'n1', 'lamp')).toBeUndefined();
  });
});

describe('swapKindOps', () => {
  it('swaps Break for Continue and keeps the target, label and place', () => {
    const ids = new Ids();
    const leave: FlowNode = {
      ...ids.next(),
      kind: 'flow.break',
      label: 'Leave',
      ports: { target: { lit: 'n2' } },
    };
    const program = automation([
      {
        ...ids.next(),
        kind: 'flow.repeat',
        ports: { times: { lit: 2 } },
        scopes: { body: scope([leave, setLight(ids, null)]) },
      },
    ]);
    const swapped = applied(program, swapKindOps(viewByKey(program, leave.key), 'flow.continue'));
    const keys = indexProgram(swapped).nodes.map((entry) => entry.node.kind);
    expect(keys).toEqual(['flow.repeat', 'flow.continue', 'device.set']);
    const next = indexProgram(swapped).nodes.find((entry) => entry.node.kind === 'flow.continue');
    expect(next?.node.label).toBe('Leave');
    expect(next?.node.ports?.['target']).toEqual({ lit: 'n2' });
  });

  it('does nothing for a trigger', () => {
    const program = automation([]);
    expect(swapKindOps(viewByKey(program, 't0'), 'flow.continue')).toEqual([]);
  });
});
