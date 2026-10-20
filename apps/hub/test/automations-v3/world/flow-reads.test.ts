import type { JsonValue } from '@smarteverything/domain';
import type { ReadRequest } from '@smarteverything/flow/interpret/frames';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFlowReads, memorySlot } from '../../../src/automations/world-v3/flow-reads';
import { SCOPE, furnish, type Home } from './support';
import type { PersistentVariables } from '../../../src/automations/world-v3/variables';
import { AUTOMATION_LEVEL } from '@smarteverything/flow/interpret/kept';

let home: Home;

beforeEach(async () => {
  home = await furnish();
});

afterEach(async () => {
  await home.test.close();
});

function request(
  kind: string,
  inputs: Readonly<Record<string, JsonValue>>,
  extra: { readonly seed?: number; readonly activation?: string } = {},
): ReadRequest {
  return {
    kind,
    node: { id: 'pick', key: 'pick' },
    inputs,
    seed: 11,
    activation: 'main/0',
    ...AUTOMATION_LEVEL,
    ...extra,
  };
}

describe('the flow read port', () => {
  const port = (): ReturnType<typeof createFlowReads> =>
    createFlowReads(home.deps, { automationId: SCOPE.automationId });

  it('answers a read as outputs', () => {
    const result = port().node(request('date.now', {}));
    expect(result).toEqual({ ok: true, value: { at: '2026-10-18T12:00:00.000Z' } });
  });

  it('reports a refused read as a failure with its class', () => {
    const result = port().node(request('random.number', { min: 6, max: 5 }));
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
  });

  it('reads automation variables by name, and nothing when unset', () => {
    home.persistent.set(`${SCOPE.automationId}:level`, { value: 7, revision: 1 });
    expect(port().variable('level')).toEqual({ ok: true, value: 7 });
    expect(port().variable('absent')).toEqual({ ok: true, value: undefined });
  });

  it('reads the kept data of a Custom Node instance, from its start value until it is set', () => {
    const stored = new Map<string, JsonValue>();
    const persistent: PersistentVariables = {
      read: (_automation, name, kept) => {
        const value = kept === undefined ? undefined : stored.get(`${kept.instance}/${name}`);
        return value === undefined ? undefined : { value, revision: 3 };
      },
    };
    const deps = { ...home.deps, persistent };
    const inInstance: ReadRequest = {
      ...request('var.get', { source: 'automation', name: 'count', asLabel: false }),
      instance: 'use1',
      kept: () => ({ ok: true, value: { instance: 'use1', type: { t: 'number' }, start: 4 } }),
    };
    const reads = createFlowReads(deps, { automationId: SCOPE.automationId });
    expect(reads.node(inInstance)).toEqual({ ok: true, value: { value: 4, revision: 0 } });
    stored.set('use1/count', 9);
    expect(reads.node(inInstance)).toEqual({ ok: true, value: { value: 9, revision: 3 } });
  });

  it('keeps read memory apart for each Custom Node instance', () => {
    const node = { id: 'pick', key: 'pick' };
    expect(memorySlot({ instance: '', node })).toBe('pick');
    expect(memorySlot({ instance: 'use1/use2', node })).toBe('use1/use2/pick');
  });

  it('draws from the run seed, not from any run id', () => {
    const roll = (seed: number): unknown =>
      port().node(request('random.number', { min: 1, max: 1_000_000 }, { seed }));
    expect(roll(5)).toEqual(roll(5));
    expect(roll(5)).not.toEqual(roll(6));
  });

  it('keeps no-repeat memory per automation and node across reads', () => {
    const seen = [0, 1, 2, 3, 4, 5].map((round) => {
      const result = port().node(
        request(
          'random.choice',
          { list: ['a', 'b', 'c'], noRepeat: true },
          { activation: `main/${String(round)}` },
        ),
      );
      return result.ok ? result.value['item'] : undefined;
    });
    expect([...seen.slice(0, 3)].sort()).toEqual(['a', 'b', 'c']);
    expect([...seen.slice(3)].sort()).toEqual(['a', 'b', 'c']);
  });
});
