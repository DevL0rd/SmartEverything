import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FunctionV3 } from '@smarteverything/domain';
import { lower } from '@smarteverything/flow/compile/lower';
import { NODE_REGISTRY } from '@smarteverything/domain';
import { jsonRecord } from '../../src/automations/engine-v3-start';
import { closeSetups, lit, node, program, rigV3, wired } from './support/rig-v3';
import type { RigV3 } from './support/rig-v3';

afterEach(closeSetups);

function keeper(lamp: string): FunctionV3 {
  return {
    version: 3,
    kind: 'function',
    flavour: 'action',
    inputs: [],
    outputs: [],
    exits: ['done'],
    variables: [{ name: 'count', type: { t: 'number' }, initial: lit(0), persist: true }],
    body: {
      nodes: [
        node('bump', 'var.change', {
          source: lit('automation'),
          name: lit('count'),
          op: lit('add'),
          amount: lit(1),
        }),
        node('show', 'device.set', {
          target: lit({ device: lamp }),
          control: lit('brightness'),
          to: wired('bump.value'),
        }),
      ],
    },
  };
}

function saved(rig: RigV3, definition: FunctionV3, id?: string): string {
  const lowered = lower(definition, { kinds: (id) => NODE_REGISTRY.get(id) });
  if (!lowered.ok) throw new Error(lowered.problems.map((found) => found.message).join('; '));
  const row = rig.functions.create({
    ...(id === undefined ? {} : { id }),
    name: 'Keeper',
    program: definition,
    layout: { nodes: {}, frames: [], comments: [] },
    interfaceHash: 'b'.repeat(64),
    compat: 'compatible',
    planHash: rig.plans.put('function', jsonRecord(lowered.plan)),
    author: null,
    createdBy: null,
  });
  return row.id;
}

function recursive(lamp: string, self: string): FunctionV3 {
  const base = keeper(lamp);
  return {
    ...base,
    body: {
      nodes: [
        ...base.body.nodes,
        node('below', 'logic.compare', { a: wired('bump.value'), op: lit('lt'), b: lit(3) }),
        {
          ...node('again', 'flow.if', {}),
          branches: [
            {
              id: randomUUID(),
              when: wired('below.result'),
              scope: { nodes: [node('deeper', 'fn.call', { fn: lit(self) })] },
            },
          ],
        },
      ],
    },
  };
}

describe('Custom Nodes run on the hub', () => {
  it('runs a call, keeps its data between runs and shares nothing between two uses', async () => {
    const rig = await rigV3();
    const id = saved(rig, keeper(rig.home.lampId));
    const row = rig.add(
      program([
        node('first', 'fn.call', { fn: lit(id) }),
        node('second', 'fn.call', { fn: lit(id) }),
      ]),
    );
    rig.engine.sync();
    for (let run = 1; run <= 2; run += 1) {
      rig.engine.start(row.id, {}, null);
      await rig.until(() => rig.finished.length === run);
    }
    expect(rig.runs(row.id).map((record) => record.error)).toStrictEqual([null, null]);
    expect(rig.runs(row.id).map((record) => record.status)).toStrictEqual([
      'succeeded',
      'succeeded',
    ]);
    expect(rig.home.adapter.executed.map((command) => command.value)).toStrictEqual([1, 1, 2, 2]);
  });

  it('lets a Custom Node call itself and keeps one row of data for the whole recursion', async () => {
    const rig = await rigV3();
    const self = randomUUID();
    saved(rig, recursive(rig.home.lampId, self), self);
    const row = rig.add(program([node('start', 'fn.call', { fn: lit(self) })]));
    rig.engine.sync();
    rig.engine.start(row.id, {}, null);
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(row.id).map((record) => record.error)).toStrictEqual([null]);
    expect(rig.home.adapter.executed.map((command) => command.value)).toStrictEqual([1, 2, 3]);
    const rows = rig.database
      .prepare("select node_id from automation_node_state where partition like 'data:%'")
      .all();
    expect(rows).toHaveLength(1);
  });
});
