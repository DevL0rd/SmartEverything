import { describe, expect, it } from 'vitest';
import {
  programReferenceIds,
  programReferences,
  type ReferenceContext,
} from '../../src/automation-v3/references-of';
import type { AutomationV3, FunctionV3 } from '../../src/automation-v3/program';
import { CTX, functionProgram, ids, node, pressTrigger, program } from './describe-fixture';

const calls: [string, number | undefined][] = [];

function context(bodies: Readonly<Record<string, FunctionV3>>): ReferenceContext {
  return {
    kinds: CTX.kinds,
    functions: (id, revision): FunctionV3 | undefined => {
      calls.push([id, revision]);
      return bodies[id];
    },
  };
}

describe('programReferenceIds', () => {
  it('finds trigger devices, target rooms and typed list items', () => {
    const found = programReferenceIds(program, context({}));
    expect([...found].sort()).toEqual([ids.switchDevice, ids.kitchen].sort());
  });

  it('reads variable initials, nested records, secrets and groups', () => {
    const wide: AutomationV3 = {
      ...program,
      variables: [
        { name: 'pick', type: { t: 'ref', of: 'device' }, initial: { lit: ids.lamp } },
        { name: 'text', type: { t: 'text' }, initial: { lit: 'not an id' } },
        {
          name: 'calc',
          type: { t: 'ref', of: 'device' },
          initial: { wire: { from: 'x', port: 'id' } },
        },
      ],
      body: {
        nodes: [
          node(1, 'call', 'http.request', {
            ports: {
              url: { lit: 'https://example.com' },
              auth: { lit: { secret: ids.secret, scheme: 'bearer' } },
              body: { lit: { secret: ids.other } },
              bad: { lit: ids.other },
              filter: { wire: { from: 'trigger', port: 'now' } },
            },
          }),
          node(2, 'set', 'device.set', {
            ports: {
              target: { lit: { devices: [ids.lamp, 5], group: ids.group, families: ['light'] } },
            },
          }),
          node(3, 'plain', 'device.set', { ports: { target: { lit: 'x' } } }),
          node(4, 'unknown', 'plugin.mystery', { ports: { a: { lit: ids.other } } }),
          node(5, 'scene', 'scene.run', { ports: { scene: { lit: ids.other } } }),
        ],
      },
    };
    const found = programReferenceIds(wide, context({}));
    expect(found.has(ids.lamp)).toBe(true);
    expect(found.has(ids.secret)).toBe(true);
    expect(found.has(ids.group)).toBe(true);
    expect(found.has('not an id')).toBe(false);
    expect(found.has('x')).toBe(false);
    expect(found.has(ids.other)).toBe(true);
  });

  it('reads open records, extra fields and values of the wrong shape', () => {
    const odd: AutomationV3 = {
      ...program,
      triggers: [
        {
          id: ids.trigger,
          key: 'sig',
          kind: 'trigger.signal',
          ports: { source: { lit: 'device' }, kind: { lit: 'state' }, match: { lit: { a: 'b' } } },
        },
      ],
      body: {
        nodes: [
          node(1, 'plain', 'device.set'),
          node(2, 'call', 'http.request', {
            ports: { auth: { lit: { secret: ids.secret, extra: ids.other } } },
          }),
          node(3, 'wrong', 'http.request', { ports: { auth: { lit: 'text' } } }),
        ],
      },
    };
    const found = programReferenceIds(odd, context({}));
    expect([...found]).toEqual([ids.secret]);
  });

  it('follows reusable nodes through the revision they use and stops on cycles', () => {
    calls.length = 0;
    const caller: AutomationV3 = {
      ...program,
      body: {
        nodes: [
          node(1, 'a', 'fn.call', { ports: { fn: { lit: ids.fn }, pin: { lit: 2 } } }),
          node(2, 'b', 'fn.call', { ports: { fn: { lit: ids.fn }, pin: { lit: 2 } } }),
          node(3, 'c', 'fn.call', { ports: { fn: { lit: ids.other } } }),
          node(4, 'd', 'fn.call', { ports: { fn: { wire: { from: 'x', port: 'id' } } } }),
        ],
      },
    };
    const recursive: FunctionV3 = {
      ...functionProgram,
      body: {
        nodes: [
          ...functionProgram.body.nodes,
          node(9, 'again', 'fn.call', { ports: { fn: { lit: ids.fn }, pin: { lit: 2 } } }),
        ],
      },
    };
    const found = programReferenceIds(caller, context({ [ids.fn]: recursive }));
    expect(found.has(ids.fn)).toBe(true);
    expect(found.has(ids.lamp)).toBe(true);
    expect(calls).toEqual([
      [ids.fn, 2],
      [ids.other, undefined],
    ]);
  });

  it('covers a function program that references another id', () => {
    expect(programReferences(functionProgram, ids.lamp, context({}))).toBe(true);
    expect(programReferences(functionProgram, ids.switchDevice, context({}))).toBe(false);
    expect(
      programReferences({ ...program, triggers: [pressTrigger] }, ids.switchDevice, context({})),
    ).toBe(true);
  });
});
