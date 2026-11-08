import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { FLASH_THE_LIGHTS } from '@smarteverything/domain';
import type { FlowNode, FunctionV3, FunctionV4, JsonValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { unstructure } from '../../src/graph/unstructure';
import type { Outputs } from '../../src/interpret/frames';
import { simulate } from '../starter-nodes/support';
import type { World } from '../starter-nodes/support';

const wire = (from: string, port: string): { wire: { from: string; port: string } } => ({
  wire: { from, port },
});

function node(key: string, id: number, kind: string, ports: FlowNode['ports']): FlowNode {
  return { id: `c0000000-0000-4000-8000-${String(id).padStart(12, '0')}`, key, kind, ports };
}

function program(body: readonly FlowNode[]): FunctionV4 {
  const graph = unstructure(tree(body), STATIC_KIND_LOOKUP);
  if (graph.kind !== 'function') throw new Error('expected a function');
  return graph;
}

function tree(body: readonly FlowNode[]): FunctionV3 {
  return {
    version: 3,
    kind: 'function',
    flavour: 'action',
    description: 'Reads and changes a light.',
    category: 'lights',
    icon: 'bell-ring',
    inputs: [],
    outputs: [],
    exits: ['done'],
    variables: [],
    body: { nodes: [...body] },
  };
}

const SET_RED = node('red', 2, 'device.set', {
  target: { lit: { target: 'hall' } },
  control: { lit: 'color' },
  to: { lit: 'red' },
});

function lightsWorld(initial: JsonValue): { world: World; current: () => JsonValue } {
  let color = initial;
  return {
    current: () => color,
    world: {
      reads: {
        'device.snapshot': (): Outputs => ({ snapshot: { hall: { color } } }),
        'device.get': (): Outputs => ({ value: color, available: true }),
      },
      effects: {
        'device.set': (params): Outputs => {
          color = params['to'] ?? null;
          return {};
        },
      },
    },
  };
}

describe('a read that captures at its step', () => {
  it('restores what was there before the change when the restore is wired straight to the read', () => {
    const { world } = lightsWorld('warm');
    const run = simulate(
      program([
        node('saved', 1, 'device.snapshot', { target: { lit: { target: 'hall' } } }),
        SET_RED,
        node('back', 3, 'device.restore', { snapshot: wire('saved', 'snapshot') }),
      ]),
      {},
      world,
    );
    expect(run.reads).toHaveLength(1);
    expect(run.effects.map((call) => call.kind)).toEqual(['device.set', 'device.restore']);
    expect(run.effects[1]?.params['snapshot']).toEqual({ hall: { color: 'warm' } });
  });

  it('puts the lights back to what they were after the starter flash', () => {
    const { world } = lightsWorld('warm');
    const run = simulate(
      FLASH_THE_LIGHTS.program,
      { lights: { target: 'hall' }, color: 'red' },
      world,
    );
    expect(run.reads).toHaveLength(1);
    const restore = run.effects.find((call) => call.kind === 'device.restore');
    expect(restore?.params['snapshot']).toEqual({ hall: { color: 'warm' } });
  });
});

describe('an ordinary read', () => {
  it('is still read when its consumer runs, after the change', () => {
    const { world } = lightsWorld('warm');
    const run = simulate(
      program([
        SET_RED,
        node('seen', 4, 'device.get', { device: { lit: 'hall' }, control: { lit: 'color' } }),
        node('log', 5, 'device.set', {
          target: { lit: { target: 'hall' } },
          control: { lit: 'color' },
          to: wire('seen', 'value'),
        }),
      ]),
      {},
      world,
    );
    expect(run.reads).toHaveLength(1);
    expect(run.effects[1]?.params['to']).toBe('red');
  });

  it('is not read at all when nothing consumes it', () => {
    const { world } = lightsWorld('warm');
    const run = simulate(
      program([
        node('seen', 4, 'device.get', { device: { lit: 'hall' }, control: { lit: 'color' } }),
        SET_RED,
      ]),
      {},
      world,
    );
    expect(run.reads).toHaveLength(0);
  });
});
