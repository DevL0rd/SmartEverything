import { describe, expect, it } from 'vitest';
import { deviceTargetOf, readsLive, staticValueOf } from '../src/automation-v2-device';
import { AUTOMATION_V2, CONDITION_V2, TRIGGER_V2 } from '../src/automation-v2-schema';
import {
  automationSignalErrorV2,
  automationUsesAi,
  conditionClockMinutes,
  runInputError,
  signalMatchesV2,
  speechTriggerOf,
  triggerTestHolds,
  type SignalTriggerV2,
  type SpeechTriggerV2,
} from '../src/automation-v2-watch';
import type { SignalInput } from '../src/signals';
import { SIGNAL_SOURCES } from '../src/signal-sources/index';

const DEVICE = '3a000000-0000-4000-8000-0000000000a1';
const ROOM = '3a000000-0000-4000-8000-0000000000d1';
const GROUP = '3a000000-0000-4000-8000-0000000000c1';
const PERSON = '3a000000-0000-4000-8000-0000000000e1';

function signalTrigger(extra: Record<string, unknown>): SignalTriggerV2 {
  const parsed = TRIGGER_V2.parse({ on: 'signal', source: 'device', kind: 'state', ...extra });
  if (parsed.on !== 'signal') throw new Error('Expected a signal trigger.');
  return parsed;
}

function speechTrigger(extra: Record<string, unknown>): SpeechTriggerV2 {
  const parsed = TRIGGER_V2.parse({ on: 'speech', phrase: 'lights on', ...extra });
  if (parsed.on !== 'speech') throw new Error('Expected a speech trigger.');
  return parsed;
}

const SIGNAL: SignalInput = {
  source: 'device',
  kind: 'state',
  subject: DEVICE,
  field: 'power',
  value: true,
  previous: false,
  at: '2026-10-08T10:00:00.000Z',
  profileId: null,
  data: { detection: 'baby_cry' },
};

describe('which signals a trigger watches', () => {
  it('matches the source and kind and then only what the trigger names', () => {
    expect(signalMatchesV2(signalTrigger({}), SIGNAL)).toBe(true);
    expect(signalMatchesV2(signalTrigger({ source: 'event' }), SIGNAL)).toBe(false);
    expect(signalMatchesV2(signalTrigger({ kind: 'other' }), SIGNAL)).toBe(false);
    expect(signalMatchesV2(signalTrigger({ subject: DEVICE, field: 'power' }), SIGNAL)).toBe(true);
    expect(signalMatchesV2(signalTrigger({ subject: 'elsewhere' }), SIGNAL)).toBe(false);
    expect(signalMatchesV2(signalTrigger({ field: 'brightness' }), SIGNAL)).toBe(false);
    expect(signalMatchesV2(signalTrigger({ match: { detection: 'baby_cry' } }), SIGNAL)).toBe(true);
    expect(signalMatchesV2(signalTrigger({ match: { detection: 'other' } }), SIGNAL)).toBe(false);
    expect(signalMatchesV2(signalTrigger({ match: { missing: 1 } }), SIGNAL)).toBe(false);
  });
});

describe('when the test of a trigger holds', () => {
  it('holds for any value without a test and compares with the previous value for changed', () => {
    expect(triggerTestHolds(undefined, 1, undefined)).toBe(true);
    expect(triggerTestHolds({ is: 'changed' }, 2, 1)).toBe(true);
    expect(triggerTestHolds({ is: 'changed' }, 2, 2)).toBe(false);
    expect(triggerTestHolds({ is: 'changed' }, 2, undefined)).toBe(false);
    expect(triggerTestHolds({ is: 'gt', to: 1 }, 2, undefined)).toBe(true);
    expect(triggerTestHolds({ is: 'in', to: ['rain'] }, 'clear', undefined)).toBe(false);
  });
});

describe('speech triggers for the transcript readers', () => {
  it('maps every source and fills the defaults', () => {
    expect(speechTriggerOf(speechTrigger({}))).toStrictEqual({
      type: 'speech',
      phrase: 'lights on',
      caseSensitive: false,
      includeBots: false,
      source: null,
    });
    expect(
      speechTriggerOf(
        speechTrigger({ caseSensitive: true, includeBots: true, source: { camera: DEVICE } }),
      ).source,
    ).toStrictEqual({ kind: 'camera', deviceId: DEVICE });
    expect(speechTriggerOf(speechTrigger({ source: { chat: ROOM } })).source).toStrictEqual({
      kind: 'attachment',
      chatId: ROOM,
    });
    expect(
      speechTriggerOf(speechTrigger({ source: { plugin: 'mic', sourceId: 'one' } })).source,
    ).toStrictEqual({ kind: 'plugin', pluginId: 'mic', sourceId: 'one' });
  });
});

describe('signal triggers against the installed signal sources', () => {
  const automation = (when: unknown[]): ReturnType<typeof AUTOMATION_V2.parse> =>
    AUTOMATION_V2.parse({ when, steps: [{ do: 'wait', ms: 1000 }] });

  it('names the first unknown signal and ignores triggers that are not signals', () => {
    expect(
      automationSignalErrorV2(
        SIGNAL_SOURCES,
        automation([
          { on: 'every', minutes: 5 },
          { on: 'signal', source: 'event', kind: 'button' },
        ]),
      ),
    ).toBeNull();
    expect(
      automationSignalErrorV2(
        SIGNAL_SOURCES,
        automation([{ on: 'signal', source: 'event', kind: 'no_such_kind' }]),
      )?.name,
    ).toBe('UnknownSignalError');
    expect(
      automationSignalErrorV2(
        SIGNAL_SOURCES,
        automation([{ on: 'signal', source: 'event', kind: 'button', match: { nope: 1 } }]),
      )?.name,
    ).toBe('UnknownSignalMatchError');
  });
});

describe('steps that need an owner', () => {
  it('finds an AI step or a tool step at any depth', () => {
    const plain = [{ do: 'wait', ms: 1000 }] as const;
    expect(automationUsesAi(AUTOMATION_V2.parse({ when: [], steps: plain }).steps)).toBe(false);
    const nested = AUTOMATION_V2.parse({
      when: [],
      steps: [
        {
          do: 'if',
          branches: [{ when: { all: [] }, then: [{ do: 'tool', person: PERSON, tool: 'call' }] }],
        },
      ],
    });
    expect(automationUsesAi(nested.steps)).toBe(true);
    const asking = AUTOMATION_V2.parse({
      when: [],
      steps: [{ do: 'ai', person: PERSON, instruction: 'look' }],
    });
    expect(automationUsesAi(asking.steps)).toBe(true);
  });
});

describe('clock times a condition changes at', () => {
  it('lists the window edges and midnight for weekdays, through groups and nots', () => {
    const minutes = (condition: unknown): readonly number[] =>
      conditionClockMinutes(CONDITION_V2.parse(condition));
    expect(minutes({ time: { after: '22:30', before: '06:15' } })).toStrictEqual([1350, 375]);
    expect(minutes({ time: { days: [1] } })).toStrictEqual([0]);
    expect(
      minutes({
        all: [{ any: [{ time: { after: '01:00' } }] }, { not: { time: { before: '02:00' } } }],
      }),
    ).toStrictEqual([60, 120]);
    expect(minutes({ daylight: 'day' })).toStrictEqual([]);
  });
});

describe('inputs of a run', () => {
  const declared = AUTOMATION_V2.parse({
    when: [],
    steps: [{ do: 'wait', ms: 1000 }],
    inputs: [
      { name: 'on', type: 'flag' },
      { name: 'level', type: 'number' },
      { name: 'wait', type: 'duration' },
      { name: 'mode', type: 'choice' },
      { name: 'note', type: 'text' },
    ],
  }).inputs;
  const good = { on: true, level: 4, wait: 1000, mode: PERSON, note: 'hi' };

  it('accepts exactly the declared names with the declared types', () => {
    expect(runInputError(declared, good)).toBeNull();
    expect(runInputError(undefined, {})).toBeNull();
    expect(runInputError(declared, { ...good, extra: 1 })).toBe(
      'The automation has no input extra.',
    );
    expect(runInputError(declared, { on: true })).toBe('Missing input level.');
    expect(runInputError(declared, { ...good, wait: -1 })).toBe('Input wait must be a duration.');
    expect(runInputError(declared, { ...good, mode: 'x' })).toBe('Input mode must be a choice.');
  });
});

describe('targets and values of a set step', () => {
  it('turns every target form into a device target', () => {
    expect(deviceTargetOf({ device: DEVICE })).toStrictEqual({
      kind: 'devices',
      deviceIds: [DEVICE],
    });
    expect(deviceTargetOf({ devices: [DEVICE, ROOM] })).toStrictEqual({
      kind: 'devices',
      deviceIds: [DEVICE, ROOM],
    });
    expect(deviceTargetOf({ group: GROUP })).toStrictEqual({ kind: 'group', groupId: GROUP });
    expect(deviceTargetOf({ room: ROOM })).toStrictEqual({ kind: 'room', roomId: ROOM });
    expect(deviceTargetOf({ room: ROOM, families: ['light'] })).toStrictEqual({
      kind: 'room',
      roomId: ROOM,
      families: ['light'],
    });
  });

  it('tells a fixed value from one that reads the home', () => {
    expect(staticValueOf(40)).toBe(40);
    expect(staticValueOf([1, 2])).toStrictEqual([1, 2]);
    expect(staticValueOf(null)).toBeNull();
    expect(staticValueOf({ r: 1, g: 2 })).toStrictEqual({ r: 1, g: 2 });
    expect(staticValueOf({ from: { value: DEVICE } })).toBeUndefined();
    expect(staticValueOf({ r: { from: { input: 'level' } }, g: 2 })).toBeUndefined();
    expect(readsLive({ from: { value: DEVICE } })).toBe(true);
    expect(readsLive(true)).toBe(false);
  });
});
