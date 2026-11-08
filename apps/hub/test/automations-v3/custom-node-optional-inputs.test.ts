import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FlowNode, FunctionV3, FunctionV4 } from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import { lower } from '@smarteverything/flow/compile/lower';
import { jsonRecord } from '../../src/automations/engine-v3-start';
import { rehearsals } from '../../src/automations/rehearsals';
import { structuredFunction } from '../../src/store/repositories/automation-trees';
import { graphFunction } from './support/graph-of';
import { closeSetups, lit, node, program, rigV3, wired } from './support/rig-v3';
import type { RigV3 } from './support/rig-v3';

afterEach(closeSetups);

const PROBE: FunctionV3 = {
  version: 3,
  kind: 'function',
  flavour: 'action',
  inputs: [
    { name: 'sensor', type: { t: 'ref', of: 'device' }, required: false },
    { name: 'level', type: { t: 'number' }, required: false },
    { name: 'label', type: { t: 'text' }, required: false },
    { name: 'items', type: { t: 'list', of: { t: 'text' } }, required: false },
  ],
  outputs: [{ name: 'mask', type: { t: 'number' } }],
  exits: ['done'],
  variables: [{ name: 'spare', type: { t: 'optional', of: { t: 'number' } }, initial: lit(5) }],
  body: {
    nodes: [
      node('hasLabel', 'logic.exists', { value: wired('inputs.label') }),
      node('labelBit', 'logic.select', {
        condition: wired('hasLabel.result'),
        whenTrue: lit(4),
        whenFalse: lit(0),
      }),
      node('level', 'logic.coalesce', { a: wired('inputs.level'), default: lit(0) }),
      node('sum', 'math.add', { a: wired('level.value'), b: wired('labelBit.value') }),
      node('result', 'flow.return', { mask: wired('sum.result') }),
    ],
  },
};

const SENSED: FunctionV3 = {
  version: 3,
  kind: 'function',
  flavour: 'action',
  inputs: [
    { name: 'lights', type: { t: 'ref', of: 'target' }, required: true },
    {
      name: 'darkSensor',
      type: { t: 'optional', of: { t: 'ref', of: 'device' } },
      required: false,
    },
  ],
  outputs: [{ name: 'done', type: { t: 'boolean' } }],
  exits: ['done'],
  variables: [{ name: 'seen', type: { t: 'text' }, initial: lit('') }],
  body: {
    nodes: [
      node('hasSensor', 'logic.exists', { value: wired('inputs.darkSensor') }),
      node('on', 'device.set', {
        target: wired('inputs.lights'),
        control: lit('power'),
        to: lit(true),
      }),
      {
        ...node('sensorKnown', 'flow.if', {}),
        branches: [
          {
            id: randomUUID(),
            when: wired('hasSensor.result'),
            scope: {
              nodes: [
                node('sensor', 'logic.coalesce', { a: wired('inputs.darkSensor') }),
                node('light', 'device.get', {
                  device: wired('sensor.value'),
                  control: lit('illumination'),
                }),
                node('remember', 'var.set', { name: lit('seen'), to: wired('light.value') }),
              ],
            },
          },
        ],
      },
      node('result', 'flow.return', { done: lit(true) }),
    ],
  },
};

function saved(rig: RigV3, definition: FunctionV4): string {
  const lowered = lower(structuredFunction(definition, STATIC_KIND_LOOKUP), {
    kinds: (id) => NODE_REGISTRY.get(id),
  });
  if (!lowered.ok) throw new Error(lowered.problems.map((found) => found.message).join('; '));
  return rig.functions.create(
    {
      name: 'Probe',
      program: definition,
      layout: { nodes: {}, frames: [], comments: [] },
      interfaceHash: 'b'.repeat(64),
      compat: 'compatible',
      planHash: rig.plans.put('function', jsonRecord(lowered.plan)),
      author: null,
      createdBy: null,
    },
    STATIC_KIND_LOOKUP,
  ).id;
}

async function runOnce(rig: RigV3, nodes: readonly FlowNode[]): Promise<string | null> {
  const row = rig.add(program(nodes));
  rig.engine.sync();
  rig.engine.start(row.id, {}, null);
  await rig.until(() => rig.finished.length === 1);
  return rig.runs(row.id).map((record) => record.error)[0] ?? null;
}

function shown(key: string, lamp: string, from: string): readonly FlowNode[] {
  return [
    node(`${key}Plus`, 'math.add', { a: wired(`${from}.mask`), b: lit(1) }),
    node(key, 'device.set', {
      target: lit({ device: lamp }),
      control: lit('brightness'),
      to: wired(`${key}Plus.result`),
    }),
  ];
}

function probeCalls(id: string, lamp: string): readonly FlowNode[] {
  return [
    node('bare', 'fn.call', { fn: lit(id) }),
    node('full', 'fn.call', {
      fn: lit(id),
      sensor: lit(lamp),
      level: lit(3),
      label: lit('hall'),
      items: lit(['a']),
    }),
    ...shown('showBare', lamp, 'bare'),
    ...shown('showFull', lamp, 'full'),
  ];
}

describe('optional Custom Node inputs on the hub', () => {
  it('reads an omitted optional input as absent and a given one as present', async () => {
    const rig = await rigV3();
    const id = saved(rig, graphFunction(PROBE, STATIC_KIND_LOOKUP));
    const error = await runOnce(rig, probeCalls(id, rig.home.lampId));
    expect(error).toBeNull();
    expect(rig.home.adapter.executed.map((command) => command.value)).toStrictEqual([1, 8]);
  });

  it('reads an optional automation input as absent until it is given', async () => {
    const rig = await rigV3();
    const row = rig.add(
      program(
        [
          node('level', 'logic.coalesce', { a: wired('inputs.level'), default: lit(1) }),
          node('show', 'device.set', {
            target: lit({ device: rig.home.lampId }),
            control: lit('brightness'),
            to: wired('level.value'),
          }),
        ],
        { inputs: [{ name: 'level', type: { t: 'number' }, required: false }] },
      ),
    );
    rig.engine.sync();
    rig.engine.start(row.id, {}, null);
    await rig.until(() => rig.finished.length === 1);
    rig.engine.start(row.id, { level: 40 }, null);
    await rig.until(() => rig.finished.length === 2);
    expect(rig.runs(row.id).map((record) => record.error)).toStrictEqual([null, null]);
    expect(rig.home.adapter.executed.map((command) => command.value)).toStrictEqual([1, 40]);
  });

  it('reads optional inputs the same way in a dry run', async () => {
    const rig = await rigV3();
    const row = rig.add(
      program(probeCalls(saved(rig, graphFunction(PROBE, STATIC_KIND_LOOKUP)), rig.home.lampId)),
    );
    rig.engine.sync();
    const rehearsal = await rehearsals({
      clock: rig.clock,
      base: rig.world(),
      watch: () => (): void => undefined,
      subjectOf: (automationId) => rig.engine.subjectOf(automationId),
      zone: () => 'UTC',
    }).run({
      automationId: row.id,
      mode: 'dry',
      inputs: {},
      scenario: undefined,
      overrides: undefined,
      breakpoints: [],
      trigger: undefined,
      startedBy: 'test',
    });
    expect(rehearsal).toMatchObject({ outcome: 'succeeded', error: null });
    expect(rehearsal.commands.map((command) => command.params['to'])).toStrictEqual([1, 8]);
    expect(rig.home.adapter.executed).toStrictEqual([]);
  });

  it('runs without an optional sensor and reads the sensor when one is given', async () => {
    const rig = await rigV3();
    const id = saved(rig, graphFunction(SENSED, STATIC_KIND_LOOKUP));
    const lights = { device: rig.home.lampId };
    const without = await runOnce(rig, [
      node('call', 'fn.call', { fn: lit(id), lights: lit(lights) }),
    ]);
    expect(without).toBeNull();
    expect(rig.home.adapter.executed.map((command) => command.value)).toStrictEqual([true]);
    const other = await rigV3();
    const withSensor = await runOnce(other, [
      node('call', 'fn.call', {
        fn: lit(saved(other, graphFunction(SENSED, STATIC_KIND_LOOKUP))),
        lights: lit({ device: other.home.lampId }),
        darkSensor: lit(other.home.lampId),
      }),
    ]);
    expect(withSensor).toContain('has no illumination control');
  });
});
