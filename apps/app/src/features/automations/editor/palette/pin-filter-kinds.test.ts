import { NODE_REGISTRY, STATIC_KIND_LOOKUP, type NodeKindLookup } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { kindLookupOf } from '../../data/kind-lookup';
import { PING_KIND_ID, kindRow } from '../../../../test-support/plugin-kinds';
import {
  automation,
  decisionProgram,
  gnode,
  idOf,
  start,
} from '../../model/graph/graph-scene-fixtures';
import { valueInHandle } from '../../model/graph/handle-ids';
import { shippedNodeEntries, type PaletteEntry } from './palette-categories';
import { execPinOf, filterEntriesForPin, outputFor, pinInsertion, valuePinOf } from './pin-filter';

const LOOKUP = kindLookupOf([kindRow()]);

function pingEntry(): PaletteEntry {
  const entries = shippedNodeEntries(NODE_REGISTRY.kinds);
  const base = entries.find((entry) => entry.kindId === 'device.set');
  if (base === undefined) throw new Error('no device.set entry');
  return { ...base, key: `node:${PING_KIND_ID}`, kindId: PING_KIND_ID, gives: [{ t: 'text' }] };
}

const PROGRAM = automation([
  start('ping'),
  gnode('ping', PING_KIND_ID, { ports: { target: { lit: 'kitchen' } } }),
]);

describe('the pin filter with plugin kinds', () => {
  it('offers a plugin action where a step goes, once the lookup knows it', () => {
    const pin = execPinOf(decisionProgram(), idOf('check'), 'else', STATIC_KIND_LOOKUP);
    if (pin === undefined) throw new Error('no pin');
    const keys = (kinds: NodeKindLookup): readonly string[] =>
      filterEntriesForPin([pingEntry()], pin, kinds).map((entry) => entry.key);
    expect(keys(LOOKUP)).toEqual([`node:${PING_KIND_ID}`]);
    expect(keys(STATIC_KIND_LOOKUP)).toEqual([]);
  });

  it('knows what a plugin input expects', () => {
    const handle = valueInHandle('target');
    expect(valuePinOf(PROGRAM, idOf('ping'), handle, LOOKUP)).toMatchObject({
      kind: 'value',
      expected: { t: 'text' },
    });
    expect(valuePinOf(PROGRAM, idOf('ping'), handle, STATIC_KIND_LOOKUP)).toBeUndefined();
  });

  it('links the plugin output that fits the pin', () => {
    expect(outputFor(PING_KIND_ID, { t: 'text' }, LOOKUP)).toBe('reply');
    expect(outputFor(PING_KIND_ID, { t: 'text' }, STATIC_KIND_LOOKUP)).toBeUndefined();
    const pin = valuePinOf(PROGRAM, idOf('ping'), valueInHandle('target'), LOOKUP);
    if (pin === undefined) throw new Error('no pin');
    expect(pinInsertion(pin, PING_KIND_ID, LOOKUP)?.link).toMatchObject({
      t: 'out',
      output: 'reply',
    });
  });
});
