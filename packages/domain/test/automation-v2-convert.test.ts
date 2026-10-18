import { describe, expect, it } from 'vitest';
import { AUTOMATION_DEFINITION, type AutomationDefinition } from '../src/automations';
import { AUTOMATION_SEQUENCE_DEFINITION } from '../src/automation-sequences';
import { AUTOMATION_VALUE_CONTENT } from '../src/automation-values';
import { automationV2Of, sequenceV2Of } from '../src/automation-v2-convert';
import { resolveToV2, type ContextV2 } from '../src/automation-v2-eval';
import type { AutomationV2, StepV2 } from '../src/automation-v2-schema';
import { AUTOMATION_VALUE_V2, automationValueV2Of } from '../src/automation-v2-values';

const DEVICE = '3a000000-0000-4000-8000-0000000000a1';
const NODE = '3a000000-0000-4000-8000-0000000000c1';
const BRANCH = '3a000000-0000-4000-8000-0000000000c2';
const RUN = '3a000000-0000-4000-8000-0000000000c3';

const CONTEXT: ContextV2 = {
  read: { device: () => undefined, value: () => 0, input: () => 0 },
  now: new Date('2026-10-08T12:00:00Z'),
  timeZone: 'UTC',
  forecast: null,
  location: null,
};

function stored(extra: Record<string, unknown> = {}): AutomationDefinition {
  return AUTOMATION_DEFINITION.parse({
    triggers: [{ type: 'time', at: '07:00', weekdays: [0, 1, 2, 3, 4, 5, 6] }],
    conditions: { mode: 'all', items: [] },
    actions: [{ type: 'notify', message: 'hello' }],
    ...extra,
  });
}

function converted(definition: AutomationDefinition): AutomationV2 {
  const result = automationV2Of(definition);
  if (!('automation' in result)) throw new Error(result.unmigrated);
  return result.automation;
}

function commandStep(value: unknown): StepV2 {
  const [step] = converted(
    stored({ actions: [{ type: 'command', deviceId: DEVICE, capability: 'color', value }] }),
  ).steps;
  if (step === undefined) throw new Error('no step');
  return step;
}

describe('what a converted automation leaves out', () => {
  it('writes only what differs from the v2 defaults', () => {
    expect(converted(stored())).toStrictEqual({
      when: [{ on: 'time', at: '07:00' }],
      steps: [{ do: 'notify', message: 'hello' }],
      mode: 'parallel',
    });
  });

  it('keeps explicit days, offsets, conditions and the origin', () => {
    const result = automationV2Of(
      stored({
        triggers: [
          { type: 'time', at: '06:30', weekdays: [1, 2], nodeId: NODE },
          { type: 'sun', event: 'sunset', offsetMinutes: -15 },
        ],
        conditions: { mode: 'any', items: [{ type: 'weekday', weekdays: [6] }] },
        origin: { plugin_id: 'home-plugin', requester: 'approved' },
      }),
    );
    expect(result).toStrictEqual({
      automation: {
        when: [
          { on: 'time', id: NODE, at: '06:30', days: [1, 2] },
          { on: 'sun', event: 'sunset', offsetMinutes: -15 },
        ],
        onlyIf: { any: [{ time: { days: [6] } }] },
        steps: [{ do: 'notify', message: 'hello' }],
        mode: 'parallel',
      },
      origin: { plugin_id: 'home-plugin', requester: 'approved' },
    });
  });

  it('turns every run policy into a mode, a limit and a key', () => {
    const modes = [
      [{ mode: 'single' }, { mode: 'single' }],
      [{ mode: 'restart' }, { mode: 'restart' }],
      [
        { mode: 'queue', limit: 4 },
        { mode: 'queue', max: 4 },
      ],
      [
        { mode: 'parallel', limit: 2 },
        { mode: 'parallel', max: 2 },
      ],
    ] as const;
    for (const [runPolicy, expected] of modes) {
      const { mode, max, key } = converted(stored({ runPolicy, controlKey: 'lights' }));
      expect({ mode, ...(max === undefined ? {} : { max }) }).toStrictEqual(expected);
      expect(key).toBe('lights');
    }
  });
});

describe('literal command values', () => {
  it('keeps plain values and field objects as they are', () => {
    expect(commandStep(7)).toMatchObject({ to: 7 });
    expect(commandStep([1, 2])).toMatchObject({ to: [1, 2] });
    expect(commandStep({ r: 1, g: 2 })).toMatchObject({ to: { r: 1, g: 2 } });
  });

  it('protects values that look like an input', () => {
    const lookalike = { from: 1 };
    expect(commandStep(lookalike)).toMatchObject({ to: { from: { literal: lookalike } } });
    expect(commandStep({ r: lookalike })).toMatchObject({
      to: { r: { from: { literal: lookalike } } },
    });
  });

  it('resolves back to the stored value', () => {
    for (const value of [7, 'x', null, [1, 2], { r: 1, g: 2 }, { from: 1 }, { r: { from: 1 } }]) {
      const step = commandStep(value);
      if (step.do !== 'set' || step.to === undefined) throw new Error('not a set step');
      expect(resolveToV2(step.to, CONTEXT)).toStrictEqual(value);
    }
  });
});

describe('automations that cannot be migrated', () => {
  it('names a step that stops one particular run', () => {
    const result = automationV2Of(
      stored({
        actions: [{ type: 'stop', nodeId: NODE, target: { type: 'run', runId: RUN } }],
      }),
    );
    expect(result).toStrictEqual({
      unmigrated: 'Stopping one particular run has no place in an automation',
    });
  });

  it('names an action argument called from', () => {
    const input = { binding: { source: 'literal', kind: 'number', value: 1 } };
    const result = automationV2Of(
      stored({
        actions: [
          {
            type: 'command',
            nodeId: NODE,
            deviceId: DEVICE,
            capability: 'color',
            binding: { type: 'fields', fields: { from: input } },
          },
        ],
      }),
    );
    expect(result).toStrictEqual({
      unmigrated: 'An action argument is named from, which a v2 input cannot carry',
    });
  });

  it('reports a stored definition that v2 would not accept', () => {
    const result = automationV2Of({
      ...stored(),
      triggers: [{ type: 'time', at: '7:00', weekdays: [1] }],
    });
    expect('unmigrated' in result && result.unmigrated).toContain('when.0.at');
  });

  it('lets unexpected failures through', () => {
    const broken = {
      ...stored(),
      get triggers(): never {
        throw new TypeError('unreadable');
      },
    };
    expect(() => automationV2Of(broken)).toThrow('unreadable');
  });
});

describe('sequences', () => {
  it('become automations without triggers that declare their inputs', () => {
    const sequence = AUTOMATION_SEQUENCE_DEFINITION.parse({
      actions: [{ type: 'notify', message: 'hi' }],
      parameters: [
        { name: 'light', kind: 'boolean' },
        { name: 'level', kind: 'number' },
        { name: 'wait', kind: 'duration' },
        { name: 'mode', kind: 'choice' },
        { name: 'note', kind: 'string' },
      ],
      runPolicy: { mode: 'queue', limit: 3 },
    });
    expect(sequenceV2Of(sequence)).toStrictEqual({
      origin: null,
      automation: {
        when: [],
        steps: [{ do: 'notify', message: 'hi' }],
        inputs: [
          { name: 'light', type: 'flag' },
          { name: 'level', type: 'number' },
          { name: 'wait', type: 'duration' },
          { name: 'mode', type: 'choice' },
          { name: 'note', type: 'text' },
        ],
        mode: 'queue',
        max: 3,
      },
    });
  });

  it('call each other through run steps that wait', () => {
    const [step] = converted(
      stored({
        actions: [
          {
            type: 'sequence',
            nodeId: NODE,
            sequenceId: RUN,
            parameters: {
              level: { binding: { source: 'parameter', kind: 'number', name: 'level' } },
            },
          },
        ],
      }),
    ).steps;
    expect(step).toStrictEqual({
      do: 'run',
      id: NODE,
      automation: RUN,
      inputs: { level: { from: { input: 'level' } } },
      wait: true,
    });
  });
});

describe('node identities', () => {
  it('survive on triggers, steps and branches', () => {
    const { when, steps } = converted(
      stored({
        triggers: [{ type: 'interval', everyMinutes: 5, nodeId: NODE }],
        actions: [
          {
            type: 'choose',
            nodeId: RUN,
            branches: [
              {
                nodeId: BRANCH,
                conditions: { mode: 'all', items: [] },
                actions: [{ type: 'notify', message: 'hi' }],
              },
            ],
          },
        ],
      }),
    );
    expect(when).toStrictEqual([{ on: 'every', id: NODE, minutes: 5 }]);
    expect(steps).toMatchObject([{ do: 'if', id: RUN, branches: [{ id: BRANCH }] }]);
  });
});

describe('Values', () => {
  it('flatten every kind and leave the defaults out', () => {
    const choice = '3a000000-0000-4000-8000-0000000000d1';
    const contents = [
      { kind: 'boolean', name: 'Away', value: true },
      { kind: 'number', name: 'Level', value: 3, bounds: { overflow: 'reject' } },
      {
        kind: 'number',
        name: 'Dial',
        value: 2,
        bounds: { minimum: 0, maximum: 10, quantum: 2, overflow: 'wrap' },
      },
      { kind: 'duration', name: 'Delay', value: 500, bounds: { maximum: 9000, overflow: 'clamp' } },
      {
        kind: 'choice',
        name: 'Scene',
        value: choice,
        choices: [{ id: choice, label: 'Calm' }],
        overflow: 'clamp',
      },
      {
        kind: 'choice',
        name: 'Loop',
        value: choice,
        choices: [{ id: choice, label: 'Calm' }],
        overflow: 'wrap',
      },
    ];
    const flattened = contents.map((content) =>
      automationValueV2Of(AUTOMATION_VALUE_CONTENT.parse(content)),
    );
    expect(flattened).toStrictEqual([
      { type: 'flag', name: 'Away', value: true },
      { type: 'number', name: 'Level', value: 3 },
      { type: 'number', name: 'Dial', value: 2, min: 0, max: 10, step: 2, overflow: 'wrap' },
      { type: 'duration', name: 'Delay', value: 500, max: 9000, overflow: 'clamp' },
      { type: 'choice', name: 'Scene', value: choice, choices: [{ id: choice, label: 'Calm' }] },
      {
        type: 'choice',
        name: 'Loop',
        value: choice,
        choices: [{ id: choice, label: 'Calm' }],
        overflow: 'wrap',
      },
    ]);
    for (const value of flattened) expect(AUTOMATION_VALUE_V2.parse(value)).toStrictEqual(value);
  });
});
