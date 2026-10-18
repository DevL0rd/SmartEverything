import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ACTION,
  AUTOMATION_DEFINITION,
  AUTOMATION_RUN_POLICY,
  AUTOMATION_RUN_STATUS,
  AUTOMATION_SEQUENCE_DEFINITION,
  AUTOMATION_V2,
  ACTIVE_AUTOMATION_RUN_STATUSES,
  MAX_AUTOMATION_DEPTH,
  automationReferences,
  usesStructuredActions,
  walkActions,
  type Action,
} from '../src';

const LAMP = '11111111-1111-4111-8111-111111111111';
const SEQUENCE = '5a000000-0000-4000-8000-000000000001';
const VALUE = '3a000000-0000-4000-8000-000000000001';

const id = (): string => randomUUID();

function power(): Record<string, unknown> {
  return { type: 'command', deviceId: LAMP, capability: 'power', value: true };
}

function repeat(actions: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'repeat',
    nodeId: id(),
    repeat: { mode: 'count', count: 2 },
    actions,
    maximumDurationMs: 60_000,
    intervalMs: 1000,
    ...extra,
  };
}

function define(actions: unknown[]): ReturnType<typeof AUTOMATION_DEFINITION.safeParse> {
  return AUTOMATION_DEFINITION.safeParse({
    triggers: [{ type: 'interval', everyMinutes: 5 }],
    conditions: { mode: 'all', items: [] },
    actions,
  });
}

function nest(depth: number): Record<string, unknown> {
  return depth === 0 ? power() : repeat([nest(depth - 1)], { nodeId: id() });
}

describe('C20 and C21 step shapes and limits', () => {
  it('accepts an if with branches and an otherwise, and a repeat in each of its three modes', () => {
    const choose = {
      type: 'choose',
      nodeId: id(),
      branches: [
        { nodeId: id(), conditions: { mode: 'all', items: [] }, actions: [power()] },
        {
          nodeId: id(),
          conditions: { mode: 'any', items: [{ type: 'weekday', weekdays: [1] }] },
          actions: [],
        },
      ],
      otherwise: [power()],
    };
    const modes = [
      { mode: 'count', count: 3 },
      { mode: 'while', conditions: { mode: 'all', items: [] } },
      { mode: 'until', conditions: { mode: 'all', items: [] } },
    ];
    expect(
      define([choose, ...modes.map((mode) => repeat([power()], { repeat: mode }))]).success,
    ).toBe(true);
  });

  it('refuses a choose without branches and a repeat without steps', () => {
    expect(define([{ type: 'choose', nodeId: id(), branches: [] }]).success).toBe(false);
    expect(define([repeat([])]).success).toBe(false);
  });

  it('bounds the repeat count, the interval and the maximum duration', () => {
    const attempt = (extra: Record<string, unknown>): boolean =>
      define([repeat([power()], extra)]).success;
    expect(attempt({ repeat: { mode: 'count', count: 10_000 } })).toBe(true);
    expect(attempt({ repeat: { mode: 'count', count: 10_001 } })).toBe(false);
    expect(attempt({ intervalMs: 99 })).toBe(false);
    expect(attempt({ maximumDurationMs: 86_400_001 })).toBe(false);
  });

  it('allows nesting up to the maximum depth and no deeper', () => {
    expect(define([nest(MAX_AUTOMATION_DEPTH - 1)]).success).toBe(true);
    const tooDeep = define([nest(MAX_AUTOMATION_DEPTH)]);
    expect(tooDeep.success).toBe(false);
    expect(JSON.stringify(tooDeep.error?.issues)).toContain('maximum depth');
  });

  it('refuses a program with more than 500 nodes and one that reuses a node identity', () => {
    const many = Array.from({ length: 501 }, power);
    expect(define(many).success).toBe(false);
    const shared = id();
    const duplicate = define([
      repeat([power()], { nodeId: shared }),
      repeat([power()], { nodeId: shared }),
    ]);
    expect(duplicate.success).toBe(false);
    expect(JSON.stringify(duplicate.error?.issues)).toContain('Duplicate action node');
  });

  it('walks every step of a program in order, including steps inside blocks', () => {
    const parsed = define([power(), repeat([power(), repeat([power()])])]);
    const actions = parsed.success ? parsed.data.actions : [];
    expect(walkActions(actions).map((action) => action.type)).toStrictEqual([
      'command',
      'repeat',
      'command',
      'repeat',
      'command',
    ]);
  });

  it('tells plain programs from structured ones', () => {
    const plain = [ACTION.parse(power()), ACTION.parse({ type: 'delay', seconds: 3 })];
    const bound: Action = ACTION.parse({
      type: 'command',
      nodeId: id(),
      deviceId: LAMP,
      capability: 'brightness',
      binding: {
        type: 'value',
        input: { binding: { source: 'literal', kind: 'number', value: 5 } },
      },
    });
    expect(usesStructuredActions(plain)).toBe(false);
    expect(usesStructuredActions([...plain, bound])).toBe(true);
    expect(usesStructuredActions([ACTION.parse(repeat([power()]))])).toBe(true);
  });

  it('refuses a command that carries both a value and a binding', () => {
    expect(
      ACTION.safeParse({
        ...power(),
        binding: {
          type: 'value',
          input: { binding: { source: 'literal', kind: 'boolean', value: true } },
        },
      }).success,
    ).toBe(false);
  });
});

describe('C22 sequences', () => {
  it('declares unique typed parameters, at most 32', () => {
    const attempt = (parameters: unknown[]): boolean =>
      AUTOMATION_SEQUENCE_DEFINITION.safeParse({ actions: [power()], parameters }).success;
    expect(attempt([{ name: 'level', kind: 'number' }])).toBe(true);
    expect(
      attempt([
        { name: 'level', kind: 'number' },
        { name: 'level', kind: 'boolean' },
      ]),
    ).toBe(false);
    expect(
      attempt(
        Array.from({ length: 33 }, (_, index) => ({ name: `p${String(index)}`, kind: 'number' })),
      ),
    ).toBe(false);
    expect(attempt([{ name: 'level', kind: 'colour' }])).toBe(false);
  });

  it('calls a sequence with named inputs', () => {
    expect(
      ACTION.safeParse({
        type: 'sequence',
        nodeId: id(),
        sequenceId: SEQUENCE,
        parameters: { level: { binding: { source: 'literal', kind: 'number', value: 3 } } },
      }).success,
    ).toBe(true);
  });
});

describe('C24 run policies and statuses', () => {
  it('knows single, restart, queue and parallel and bounds their limits', () => {
    const parse = (value: unknown): boolean => AUTOMATION_RUN_POLICY.safeParse(value).success;
    expect([
      parse({ mode: 'single' }),
      parse({ mode: 'restart' }),
      parse({ mode: 'queue', limit: 100 }),
      parse({ mode: 'queue', limit: 101 }),
      parse({ mode: 'parallel', limit: 32 }),
      parse({ mode: 'parallel', limit: 33 }),
      parse({ mode: 'parallel' }),
      parse({ mode: 'single', limit: 2 }),
    ]).toStrictEqual([true, true, true, false, true, false, false, false]);
  });

  it('treats queued, running and cancelling as active and every other status as finished', () => {
    const active = AUTOMATION_RUN_STATUS.options.filter((status) =>
      ACTIVE_AUTOMATION_RUN_STATUSES.has(status),
    );
    expect(active).toStrictEqual(['queued', 'running', 'cancelling']);
    expect(AUTOMATION_RUN_STATUS.options).toContain('interrupted');
    expect(AUTOMATION_RUN_STATUS.options).toContain('ignored');
  });

  it('carries the run policy and control key in the definition', () => {
    const parsed = AUTOMATION_DEFINITION.parse({
      triggers: [{ type: 'interval', everyMinutes: 5 }],
      conditions: { mode: 'all', items: [] },
      actions: [power()],
      runPolicy: { mode: 'queue', limit: 2 },
      controlKey: 'night',
    });
    expect([parsed.runPolicy, parsed.controlKey]).toStrictEqual([
      { mode: 'queue', limit: 2 },
      'night',
    ]);
  });

  it('describes who stops what with a stop step: current, a run, or an automation by key', () => {
    const stop = (target: unknown): boolean =>
      ACTION.safeParse({ type: 'stop', nodeId: id(), target }).success;
    expect(stop({ type: 'current' })).toBe(true);
    expect(stop({ type: 'run', runId: id() })).toBe(true);
    expect(stop({ type: 'automation', id: id(), controlKey: 'night' })).toBe(true);
    expect(stop({ type: 'sequence', id: id() })).toBe(true);
    expect(stop({ type: 'everything' })).toBe(false);
  });
});

describe('C23 and C27 finding what uses a Value, choice, automation, room or device', () => {
  const find = (steps: readonly unknown[], reference: string, extra: object = {}): boolean =>
    automationReferences(AUTOMATION_V2.parse({ when: [], steps, ...extra }), reference);

  it('finds an id wherever the program names it', () => {
    expect(find([{ do: 'run', automation: SEQUENCE }], SEQUENCE)).toBe(true);
    expect(
      find([{ do: 'notify', message: 'x' }], VALUE, {
        onlyIf: { compare: { value: VALUE }, test: { is: 'eq', to: 1 } },
      }),
    ).toBe(true);
    const set = { do: 'set', control: 'power', to: true };
    expect(find([{ ...set, target: { room: LAMP } }], LAMP)).toBe(true);
    expect(find([{ ...set, target: { group: LAMP } }], LAMP)).toBe(true);
    expect(find([{ ...set, target: { devices: [SEQUENCE, LAMP] } }], LAMP)).toBe(true);
  });

  it('finds a choice used as a literal, a comparison value or a Value operation', () => {
    const set = { do: 'set', target: { device: LAMP }, control: 'mode' };
    expect(find([{ ...set, to: { from: { literal: VALUE } } }], VALUE)).toBe(true);
    expect(
      find([{ do: 'notify', message: 'x' }], VALUE, {
        onlyIf: { compare: { value: SEQUENCE }, test: { is: 'eq', to: VALUE } },
      }),
    ).toBe(true);
    expect(find([{ do: 'value', value: SEQUENCE, op: 'set', amount: VALUE }], VALUE)).toBe(true);
  });

  it('does not report an id that is only mentioned as free text', () => {
    expect(find([{ do: 'notify', message: VALUE }], VALUE)).toBe(false);
    expect(find([{ do: 'wait', ms: 1000 }], VALUE)).toBe(false);
  });
});
