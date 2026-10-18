import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AUTOMATION_V2,
  EDIT_AUTOMATION_V2,
  stepChildren,
  walkSteps,
} from '../src/automation-v2-schema';

const DEVICE = '3a000000-0000-4000-8000-0000000000a1';
const VALUE = '3a000000-0000-4000-8000-0000000000b1';
const ROOM = '3a000000-0000-4000-8000-0000000000d1';
const PERSON = '3a000000-0000-4000-8000-0000000000e1';
const OTHER = '3a000000-0000-4000-8000-0000000000c1';
const ID_ONE = '3a000000-0000-4000-8000-0000000000f1';

const LEVEL = { device: DEVICE, control: 'brightness' };
const NOTIFY = { do: 'notify', message: 'hi' };
const PLAIN_SET = { do: 'set', target: { device: DEVICE }, control: 'power' };
const SET = { ...PLAIN_SET, to: true };

function automation(extra: Record<string, unknown>): unknown {
  return { when: [], steps: [NOTIFY], ...extra };
}

function rejects(extra: Record<string, unknown>): string {
  const result = AUTOMATION_V2.safeParse(automation(extra));
  expect(result.success).toBe(false);
  return result.error?.issues.map((issue) => issue.message).join('; ') ?? '';
}

const RICH = automation({
  when: [
    { on: 'time', at: '07:00', days: [1, 2] },
    { on: 'every', minutes: 10 },
    { on: 'sun', event: 'sunrise', offsetMinutes: -10 },
    {
      on: 'signal',
      source: 'device',
      kind: 'state',
      subject: DEVICE,
      field: 'power',
      test: { is: 'changed' },
      window: { of: 'avg', seconds: 60 },
      holdSeconds: 5,
    },
    { on: 'speech', phrase: 'lights on', source: { camera: DEVICE } },
    { on: 'speech', phrase: 'good night', source: { plugin: 'mic', sourceId: 'one' } },
    { on: 'speech', phrase: 'hello', source: { chat: OTHER } },
  ],
  onlyIf: {
    all: [
      { compare: LEVEL, test: { is: 'between', min: 1, max: 5 } },
      { compare: { weather: 'kind' }, test: { is: 'in', to: ['rain'] } },
      { compare: { from: { value: VALUE }, add: 1, max: 9 }, test: { is: 'gt', to: 2 } },
      { not: { time: { after: '22:00', before: '06:00', days: [0] } } },
      { any: [{ daylight: 'night', sunriseOffset: 10 }, { all: [] }] },
    ],
  },
  steps: [
    {
      do: 'set',
      target: { room: ROOM, families: ['light'] },
      control: 'brightness',
      to: 40,
      percent: true,
    },
    {
      do: 'set',
      target: { devices: [DEVICE] },
      control: 'color',
      to: { r: { from: { input: 'level' } }, g: 4 },
    },
    {
      do: 'set',
      target: { group: OTHER },
      control: 'brightness',
      by: 10,
      for: 60_000,
      priority: 2,
      while: { all: [] },
    },
    { do: 'scene', scene: OTHER },
    { do: 'wait', ms: 1000 },
    { do: 'ai', person: PERSON, instruction: 'look' },
    { do: 'tool', person: PERSON, tool: 'call', args: { a: 1 } },
    { do: 'value', value: VALUE, op: 'add', amount: 2 },
    { do: 'value', value: VALUE, op: 'toggle' },
    {
      do: 'if',
      branches: [{ when: { all: [] }, then: [NOTIFY] }],
      else: [{ do: 'repeat', times: 3, gapMs: 100, limitMs: 1000, steps: [NOTIFY] }],
    },
    { do: 'run', automation: OTHER, inputs: { level: 3 }, wait: true },
    { do: 'stop', automation: OTHER, key: 'k' },
  ],
  mode: 'queue',
  max: 3,
  key: 'k',
});

describe('automation v2 schema', () => {
  it('accepts every trigger, condition and step form', () => {
    expect(AUTOMATION_V2.safeParse(RICH).success).toBe(true);
  });

  it('keeps inputs for automations that have no triggers', () => {
    const inputs = [{ name: 'level', type: 'number' }];
    expect(AUTOMATION_V2.safeParse(automation({ inputs })).success).toBe(true);
    expect(rejects({ inputs, when: [{ on: 'every', minutes: 5 }] })).toBe(
      'Inputs belong to automations without triggers',
    );
  });

  it('walks nested steps and has no children on a plain step', () => {
    const parsed = AUTOMATION_V2.parse(RICH);
    expect(walkSteps(parsed.steps).map((step) => step.do)).toContain('repeat');
    const [plain] = AUTOMATION_V2.parse(automation({})).steps;
    expect(plain && stepChildren(plain)).toStrictEqual([]);
  });

  it('keeps edit_automation under 32 KB as the hub publishes it', () => {
    for (const reused of ['inline', 'ref'] as const) {
      const json = z.toJSONSchema(EDIT_AUTOMATION_V2, {
        io: 'input',
        unrepresentable: 'any',
        cycles: 'ref',
        reused,
      });
      expect(JSON.stringify(json).length).toBeLessThan(32_000);
    }
  });

  it('wraps an automation in an edit request', () => {
    expect(
      EDIT_AUTOMATION_V2.safeParse({ action: 'update', id: OTHER, revision: 3, automation: RICH })
        .success,
    ).toBe(true);
    expect(EDIT_AUTOMATION_V2.safeParse({ action: 'archive' }).success).toBe(false);
  });
});

describe('set steps', () => {
  it('need exactly one of to and by', () => {
    expect(rejects({ steps: [{ ...SET, to: undefined }] })).toContain('exactly one of to and by');
    expect(rejects({ steps: [{ ...SET, by: 1, for: 5 }] })).toContain('exactly one of to and by');
  });

  it('allow by, while and priority only with for', () => {
    for (const extra of [{ by: 1 }, { to: 1, while: { all: [] } }, { to: 1, priority: 1 }])
      expect(rejects({ steps: [{ ...PLAIN_SET, ...extra }] })).toContain(
        'belong to a temporary change',
      );
    expect(
      AUTOMATION_V2.safeParse(automation({ steps: [{ ...PLAIN_SET, by: 1, for: 9 }] })).success,
    ).toBe(true);
  });

  it('reject field objects that carry a from key or a misshapen input', () => {
    expect(rejects({ steps: [{ ...SET, to: { from: { nothing: true } } }] })).not.toBe('');
    expect(rejects({ steps: [{ ...SET, to: { a: { from: { nothing: true } } } }] })).not.toBe('');
    expect(
      AUTOMATION_V2.safeParse(automation({ steps: [{ ...SET, to: { a: [1] } }] })).success,
    ).toBe(true);
  });
});

describe('repeat and value steps', () => {
  const REPEAT = { do: 'repeat', steps: [NOTIFY] };

  it('repeat needs exactly one stop rule and a step', () => {
    expect(rejects({ steps: [REPEAT] })).toContain('exactly one of times, while and until');
    expect(rejects({ steps: [{ ...REPEAT, times: 2, while: { all: [] } }] })).toContain(
      'exactly one of times, while and until',
    );
    expect(rejects({ steps: [{ do: 'repeat', times: 2, steps: [] }] })).toContain('needs a step');
    expect(
      AUTOMATION_V2.safeParse(automation({ steps: [{ ...REPEAT, until: { all: [] } }] })).success,
    ).toBe(true);
  });

  it('value steps carry an amount only where one is needed', () => {
    const value = { do: 'value', value: VALUE };
    expect(rejects({ steps: [{ ...value, op: 'set' }] })).toContain('need an amount');
    expect(rejects({ steps: [{ ...value, op: 'next', amount: 1 }] })).toContain('need an amount');
  });
});

describe('conditions', () => {
  it('need something to look at and a sensible window', () => {
    expect(rejects({ onlyIf: { time: {} } })).toContain('needs a window or days');
    expect(rejects({ onlyIf: { time: { after: '08:00', before: '08:00' } } })).toContain(
      'must not start and end at the same time',
    );
    expect(
      rejects({ onlyIf: { compare: LEVEL, test: { is: 'between', min: 5, max: 1 } } }),
    ).toContain('min must not exceed max');
    expect(rejects({ onlyIf: { compare: LEVEL, test: { is: 'in', to: [] } } })).not.toBe('');
    expect(rejects({ onlyIf: { any: [] } })).not.toBe('');
  });
});

describe('whole automations', () => {
  it('need steps and a unique set of input names', () => {
    expect(rejects({ steps: [] })).not.toBe('');
    expect(
      rejects({
        inputs: [
          { name: 'a', type: 'flag' },
          { name: 'a', type: 'text' },
        ],
      }),
    ).toContain('Input names must be unique');
  });

  it('need unique node identities across triggers, steps and branches', () => {
    expect(
      rejects({
        when: [{ on: 'every', id: ID_ONE, minutes: 1 }],
        steps: [{ ...NOTIFY, id: ID_ONE }],
      }),
    ).toContain('Node identities must be unique');
    expect(
      rejects({
        steps: [
          {
            do: 'if',
            branches: [
              { id: ID_ONE, when: { all: [] }, then: [] },
              { id: ID_ONE, when: { all: [] }, then: [] },
            ],
          },
        ],
      }),
    ).toContain('Node identities must be unique');
  });

  it('pair max with the queue and parallel modes', () => {
    expect(rejects({ mode: 'queue' })).toContain('queue needs it');
    expect(rejects({ mode: 'single', max: 2 })).toContain('queue needs it');
    expect(rejects({ max: 2 })).toContain('queue needs it');
    for (const extra of [
      {},
      { mode: 'parallel' },
      { mode: 'parallel', max: 2 },
      { mode: 'restart' },
    ])
      expect(AUTOMATION_V2.safeParse(automation(extra)).success).toBe(true);
  });

  it('accept long text, long waits and large counts from the home', () => {
    const long = 'x'.repeat(5000);
    const extra = {
      mode: 'parallel',
      max: 500,
      key: long,
      when: [{ on: 'every', minutes: 100_000 }],
      steps: [
        { do: 'notify', message: long },
        { do: 'ai', person: PERSON, instruction: long },
        { do: 'wait', ms: 200_000_000 },
        { do: 'repeat', times: 50_000, gapMs: 200_000_000, steps: [NOTIFY] },
      ],
    };
    expect(AUTOMATION_V2.safeParse(automation(extra)).success).toBe(true);
    expect(rejects({ steps: [{ ...SET, control: 'not a control' }] })).not.toBe('');
  });

  it('refuse keys they do not know', () => {
    expect(rejects({ extra: 1 })).not.toBe('');
  });
});

describe('signal and speech triggers', () => {
  it('keep the limits the signal engine works within', () => {
    const signal = { on: 'signal', source: 'device', kind: 'state' };
    expect(rejects({ when: [{ ...signal, window: { of: 'avg', seconds: 99_999 } }] })).not.toBe('');
    expect(rejects({ when: [{ ...signal, holdSeconds: 0 }] })).not.toBe('');
    expect(rejects({ when: [{ on: 'speech', phrase: '...' }] })).toContain('spoken word');
  });
});
