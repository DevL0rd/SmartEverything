import { describe, expect, it } from 'vitest';
import { applyPatch } from '@smarteverything/flow/ops/reducer';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import { automation, step } from '../../model/editor/editor-fixtures';
import { fixOps } from './fix-actions';

describe('one tap fixes as ops', () => {
  it('sets a port', () => {
    const program = automation([step('lamp')]);
    const ops = fixOps(program, {
      action: 'set_port',
      key: 'lamp',
      port: 'ignoreOwnChanges',
      value: { lit: true },
    });
    expect(ops).toEqual([{ op: 'set', key: 'lamp', ports: { ignoreOwnChanges: { lit: true } } }]);
  });

  it('replaces a polling loop by Wait until true in the same place', () => {
    const program = automation([step('first'), step('poll'), step('last')]);
    const ops = fixOps(program, { action: 'wait_until', key: 'poll', condition: { lit: true } });
    const result = applyPatch(program, ops ?? []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const kinds = result.program.body.nodes.map((entry) => entry.kind);
    expect(kinds).toEqual(['device.set', 'flow.wait_condition', 'device.set']);
    expect(indexProgram(result.program).byKey.has('poll')).toBe(false);
    const waiting = result.program.body.nodes[1];
    expect(waiting?.ports).toEqual({ condition: { lit: true } });
    expect(indexProgram(result.program).nodes).toHaveLength(3);
  });

  it('replaces an If chain by Change variable set to Next, keeping the variable source', () => {
    const program = {
      ...automation([step('chain')]),
      variables: [{ name: 'mode', type: { t: 'number' as const }, initial: { lit: 0 } }],
    };
    const ops = fixOps(program, { action: 'cycle_variable', key: 'chain', variable: 'mode' });
    const result = applyPatch(program, ops ?? []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.program.body.nodes[0]).toMatchObject({
      kind: 'var.change',
      ports: { name: { lit: 'mode' }, op: { lit: 'next' } },
    });
  });

  it('offers no one tap fix where no mechanical change exists', () => {
    const program = automation([step('chain')]);
    expect(fixOps(program, { action: 'lookup_table', key: 'chain', variable: 'mode' })).toBeNull();
    expect(
      fixOps(program, { action: 'wait_until', key: 'gone', condition: { lit: true } }),
    ).toBeNull();
  });
});
