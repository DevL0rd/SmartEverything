import { describe, expect, it } from 'vitest';
import type {
  FlowNode,
  FlowType,
  JsonValue,
  PortValue,
  TriggerNode,
} from '@smarteverything/domain';
import { LONG_DELAY_MS } from '../../src/check/lint-advice';
import { automation, wired, functionProgram, lit, node, trigger } from './c23-support';
import { findings, only } from './lint-support';

describe('lint of storm protection', () => {
  it('warns when a switch is off and offers to turn them on', () => {
    const found = findings(
      automation([], { budgets: { startBucket: 'off', feedback: 'on', effects: 'off' } }),
    );
    const [hit] = only(found, 'storm_protection_off');
    expect(hit?.received).toBe('startBucket, effects');
    expect(hit?.fix?.action).toEqual({ action: 'turn_on_storm_protection' });
    expect(hit?.severity).toBe('warning');
  });

  it('is quiet for new programs, explicit on and functions', () => {
    expect(only(findings(automation([])), 'storm_protection_off')).toEqual([]);
    const on = automation([], { budgets: { startBucket: 'on' } });
    expect(only(findings(on), 'storm_protection_off')).toEqual([]);
    expect(only(findings(functionProgram([])), 'storm_protection_off')).toEqual([]);
  });
});

describe('lint of event waits', () => {
  const wait = (key: string, extra: Record<string, PortValue> = {}): FlowNode =>
    node(key, 'flow.wait_event', { source: lit('device'), kind: lit('state'), ...extra });

  it('asks for a timeout', () => {
    const found = findings(automation([wait('open'), wait('capped', { timeout: lit(5000) })]));
    expect(only(found, 'event_wait_without_timeout').map((item) => item.key)).toEqual(['open']);
  });
});

describe('lint of triggers that start themselves', () => {
  const known = { known: new Set(['d1', 'd2']) };
  const watching = (ports: Record<string, PortValue> = {}): TriggerNode =>
    trigger('t', 'trigger.device', { device: lit('d1'), ignoreOwnChanges: lit(false), ...ports });
  const setter = (target: JsonValue, ports: Record<string, PortValue> = {}): FlowNode =>
    node('set', 'device.set', { target: lit(target), to: lit(true), ...ports });

  it('warns and offers to ignore own changes', () => {
    const cases = [
      [watching({ control: lit('power') }), setter({ device: 'd1' })],
      [watching(), setter({ devices: ['d2', 'd1'] }, { control: lit('power') })],
      [
        watching({ control: lit('brightness') }),
        setter({ device: 'd1' }, { control: lit('brightness') }),
      ],
    ] as const;
    for (const [started, change] of cases) {
      const found = findings(automation([change], { triggers: [started] }), known);
      const [hit] = only(found, 'feedback_trigger');
      expect(hit?.key).toBe('t');
      expect(hit?.fix?.action).toEqual({
        action: 'set_port',
        key: 't',
        port: 'ignoreOwnChanges',
        value: { lit: true },
      });
    }
  });

  it('is quiet when the automation does not set what starts it', () => {
    const quiet = [
      [watching(), setter({ device: 'd2' })],
      [watching({ control: lit('brightness') }), setter({ device: 'd1' })],
      [watching(), setter({ room: 'r1' })],
      [watching(), setter({ devices: ['d2'] })],
      [watching(), node('set', 'device.set', { target: wired('inputs.t'), to: lit(true) })],
      [trigger('t', 'trigger.device', { device: lit('d1') }), setter({ device: 'd1' })],
      [watching({ ignoreOwnChanges: wired('inputs.flag') }), setter({ device: 'd1' })],
      [watching({ ignoreOwnChanges: lit(true) }), setter({ device: 'd1' })],
      [
        trigger('t', 'trigger.device', { device: wired('inputs.d'), ignoreOwnChanges: lit(false) }),
        setter({ device: 'd1' }),
      ],
      [trigger('t', 'trigger.device', { ignoreOwnChanges: lit(false) }), setter({ device: 'd1' })],
      [
        trigger('t', 'trigger.time', {
          at: lit('07:00'),
          device: lit('d1'),
          ignoreOwnChanges: lit(false),
        }),
        setter({ device: 'd1' }),
      ],
    ] as const;
    for (const [started, change] of quiet) {
      const found = findings(automation([change], { triggers: [started] }), known);
      expect(only(found, 'feedback_trigger')).toEqual([]);
    }
    const wrongTarget = findings(
      automation([node('set', 'device.set', { target: lit('d1'), to: lit(true) })], {
        triggers: [watching()],
      }),
      known,
    );
    expect(only(wrongTarget, 'feedback_trigger')).toEqual([]);
    const list = findings(
      automation([node('set', 'device.set', { target: lit(['d1']), to: lit(true) })], {
        triggers: [watching()],
      }),
      known,
    );
    expect(only(list, 'feedback_trigger')).toEqual([]);
    expect(only(findings(functionProgram([])), 'feedback_trigger')).toEqual([]);
  });
});

describe('lint of lists of anything', () => {
  const any: FlowType = { t: 'any' };
  const listOfAny: FlowType = { t: 'list', of: any };

  it('finds list<any> in variables, inputs and outputs, at any depth', () => {
    const found = findings(
      automation([], {
        variables: [
          { name: 'plain', type: listOfAny, initial: lit([]) },
          { name: 'maybe', type: { t: 'optional', of: listOfAny }, initial: lit([]) },
          { name: 'nested', type: { t: 'list', of: { t: 'list', of: any } }, initial: lit([]) },
          {
            name: 'fields',
            type: { t: 'record', fields: { a: listOfAny } },
            initial: lit({ a: [] }),
          },
          { name: 'values', type: { t: 'record', values: listOfAny }, initial: lit({}) },
        ],
        inputs: [{ name: 'in', type: listOfAny, required: false }],
        outputs: [{ name: 'out', type: listOfAny }],
      }),
    );
    expect(only(found, 'list_of_any').map((item) => item.port)).toEqual([
      'variables.plain',
      'variables.maybe',
      'variables.nested',
      'variables.fields',
      'variables.values',
      'inputs.in',
      'outputs.out',
    ]);
  });

  it('accepts typed lists and other types', () => {
    const found = findings(
      automation([], {
        variables: [
          { name: 'names', type: { t: 'list', of: { t: 'text' } }, initial: lit([]) },
          { name: 'bare', type: any, initial: lit(0) },
          {
            name: 'rec',
            type: { t: 'record', fields: { a: any }, values: { t: 'text' } },
            initial: lit({ a: 1 }),
          },
          { name: 'empty', type: { t: 'record' }, initial: lit({}) },
        ],
      }),
    );
    expect(only(found, 'list_of_any')).toEqual([]);
  });
});

describe('lint of long delays', () => {
  const delay = (key: string, duration: PortValue): FlowNode =>
    node(key, 'flow.wait', { duration });

  it('warns when a single automation waits long', () => {
    const found = findings(
      automation([
        delay('long', lit(LONG_DELAY_MS)),
        delay('short', lit(LONG_DELAY_MS - 1)),
        delay('dynamic', wired('inputs.d')),
      ]),
    );
    expect(only(found, 'long_delay_single').map((item) => item.key)).toEqual(['long']);
  });

  it('is quiet for other run modes and functions', () => {
    const queued = automation([delay('long', lit(LONG_DELAY_MS))], { policy: { mode: 'queue' } });
    expect(only(findings(queued), 'long_delay_single')).toEqual([]);
    expect(
      only(findings(functionProgram([delay('long', lit(LONG_DELAY_MS))])), 'long_delay_single'),
    ).toEqual([]);
  });
});

describe('lint of feed notes', () => {
  it('hints that a feed note sends no push message', () => {
    const found = findings(automation([node('note', 'notify.feed', { message: lit('hi') })]));
    const [hit] = only(found, 'notify_feed_upgrade');
    expect(hit?.severity).toBe('hint');
    expect(hit?.key).toBe('note');
  });
});

describe('lint of AI calls with tools', () => {
  const ask = (ports: Record<string, PortValue>): FlowNode => node('ask', 'ai.ask', ports);

  it('warns when tools are allowed and the question comes from data', () => {
    const tooled = ask({ prompt: wired('trigger.value'), tools: lit(['set_device']) });
    const [hit] = only(findings(automation([tooled])), 'ai_tools_untrusted');
    expect(hit?.severity).toBe('warning');
    expect(hit?.key).toBe('ask');
  });

  it('is quiet without tools or with a fixed question', () => {
    const none = ask({ prompt: wired('trigger.value'), tools: lit([]) });
    const unset = ask({ prompt: wired('trigger.value') });
    const fixed = ask({ prompt: lit('Good morning'), tools: lit(['x']) });
    for (const program of [none, unset, fixed]) {
      expect(only(findings(automation([program])), 'ai_tools_untrusted')).toEqual([]);
    }
  });
});
