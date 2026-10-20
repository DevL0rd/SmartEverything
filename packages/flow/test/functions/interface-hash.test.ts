import type { FlowType } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  canonicalType,
  interfaceHash,
  interfaceOf,
  interfaceSignature,
} from '../../src/functions/interface-hash';
import type { FunctionV3 } from '@smarteverything/domain';
import type { FunctionInterface } from '../../src/functions/interface-hash';
import { NUMBER, TEXT, fn } from './support';

const base = fn([], {
  inputs: [
    { name: 'b', type: NUMBER, required: true },
    { name: 'a', type: TEXT, required: false },
  ],
  outputs: [{ name: 'out', type: NUMBER }],
  exits: ['two', 'one'],
});

describe('interfaceHash', () => {
  it('is 64 hex digits and stable', () => {
    expect(interfaceHash(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(interfaceHash(base)).toBe(interfaceHash(structuredClone(base)));
  });

  it('ignores order, labels, descriptions and defaults', () => {
    const shuffled = fn([], {
      inputs: [
        { name: 'a', type: TEXT, required: false, label: 'A', description: 'x', default: 'y' },
        { name: 'b', type: NUMBER, required: true },
      ],
      outputs: [{ name: 'out', type: NUMBER, description: 'd' }],
      exits: ['one', 'two'],
    });
    expect(interfaceHash(shuffled)).toBe(interfaceHash(base));
  });

  it('ignores the order of type keys', () => {
    expect(canonicalType({ t: 'number', min: 1, max: 2 })).toBe(
      canonicalType({ t: 'number', max: 2, min: 1 }),
    );
  });

  it('sorts keys at every depth and keeps lists in order', () => {
    const choice: FlowType = {
      t: 'choice',
      options: [
        { label: 'B', id: 'b' },
        { id: 'a', label: 'A' },
      ],
    };
    expect(canonicalType(choice)).toBe(
      '{"options":[{"id":"b","label":"B"},{"id":"a","label":"A"}],"t":"choice"}',
    );
  });

  it('changes with names, types, requiredness, optional outputs, exits and flavour', () => {
    const variants = [
      fn([], { ...pieces(base), inputs: [{ name: 'c', type: NUMBER, required: true }] }),
      fn([], { ...pieces(base), outputs: [{ name: 'out', type: TEXT }] }),
      fn([], { ...pieces(base), outputs: [{ name: 'out', type: NUMBER, optional: true }] }),
      fn([], { ...pieces(base), exits: ['one'] }),
      fn([], { ...pieces(base), flavour: 'pure' }),
      fn([], {
        ...pieces(base),
        inputs: [
          { name: 'b', type: NUMBER, required: false },
          { name: 'a', type: TEXT, required: false },
        ],
      }),
    ];
    const hashes = new Set([interfaceHash(base), ...variants.map(interfaceHash)]);
    expect(hashes.size).toBe(variants.length + 1);
  });

  it('keeps the flavour out of the signature when it is unknown', () => {
    expect(interfaceSignature(interfaceOf({ inputs: [], outputs: [], exits: [] }))).toContain(
      '"flavour":null',
    );
    expect(interfaceOf(base).flavour).toBe('action');
    expect('flavour' in interfaceOf({ inputs: [], outputs: [], exits: [] })).toBe(false);
  });
});

function pieces(source: FunctionV3): FunctionInterface {
  return {
    inputs: [...source.inputs],
    outputs: [...source.outputs],
    exits: [...source.exits],
    flavour: source.flavour,
  };
}
