import { describe, expect, it } from 'vitest';
import { automationReferenceIds, automationReferences } from '../src/automation-references';
import { AUTOMATION_V2, type AutomationV2 } from '../src/automation-v2-schema';

const id = (digit: string): string =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;

const DEVICE = id('1');
const OTHER_DEVICE = id('2');
const ROOM = id('3');
const GROUP = id('4');
const SCENE = id('5');
const PERSON = id('6');
const CHAT = id('7');
const COMPUTER = id('8');
const VALUE = id('9');
const AUTOMATION = id('a');
const CAMERA = id('b');

function automation(definition: object): AutomationV2 {
  return AUTOMATION_V2.parse(definition);
}

function referenced(definition: object): readonly string[] {
  return [...automationReferenceIds(automation(definition))].sort();
}

const set = (target: object, to: unknown = 1): object => ({
  do: 'set',
  target,
  control: 'power',
  to,
});

describe('what an automation points at', () => {
  it('has nothing to point at when it only waits and notifies', () => {
    expect(
      referenced({
        when: [],
        steps: [
          { do: 'wait', ms: 100 },
          { do: 'notify', message: 'hi' },
        ],
      }),
    ).toEqual([]);
  });

  it('names the targets of a set step in all four shapes', () => {
    expect(referenced({ when: [], steps: [set({ device: DEVICE })] })).toEqual([DEVICE]);
    expect(referenced({ when: [], steps: [set({ devices: [DEVICE, OTHER_DEVICE] })] })).toEqual(
      [DEVICE, OTHER_DEVICE].sort(),
    );
    expect(referenced({ when: [], steps: [set({ room: ROOM })] })).toEqual([ROOM]);
    expect(referenced({ when: [], steps: [set({ group: GROUP })] })).toEqual([GROUP]);
  });

  it('names the scene, the person, the chat and the computer a step uses', () => {
    expect(referenced({ when: [], steps: [{ do: 'scene', scene: SCENE }] })).toEqual([SCENE]);
    expect(
      referenced({ when: [], steps: [{ do: 'ai', person: PERSON, chat: CHAT, instruction: 'x' }] }),
    ).toEqual([PERSON, CHAT].sort());
    expect(
      referenced({ when: [], steps: [{ do: 'ai', person: PERSON, instruction: 'x' }] }),
    ).toEqual([PERSON]);
    expect(referenced({ when: [], steps: [{ do: 'tool', person: PERSON, tool: 'x' }] })).toEqual([
      PERSON,
    ]);
    expect(
      referenced({
        when: [],
        steps: [
          {
            do: 'audio',
            computer: COMPUTER,
            change: { action: 'mute', muted: true, kind: 'output' },
          },
        ],
      }),
    ).toEqual([COMPUTER]);
  });

  it('names a stored value and the automation a step runs or stops', () => {
    expect(referenced({ when: [], steps: [{ do: 'value', value: VALUE, op: 'toggle' }] })).toEqual([
      VALUE,
    ]);
    expect(
      referenced({
        when: [],
        steps: [
          {
            do: 'value',
            value: VALUE,
            op: 'set',
            amount: { from: { device: DEVICE, control: 'power' } },
          },
        ],
      }),
    ).toEqual([DEVICE, VALUE].sort());
    expect(
      referenced({
        when: [],
        steps: [
          {
            do: 'run',
            automation: AUTOMATION,
            inputs: { level: { from: { value: OTHER_DEVICE } } },
          },
          { do: 'stop', automation: CHAT },
          { do: 'stop' },
        ],
      }),
    ).toEqual([AUTOMATION, OTHER_DEVICE, CHAT].sort());
    expect(referenced({ when: [], steps: [{ do: 'run', automation: AUTOMATION }] })).toEqual([
      AUTOMATION,
    ]);
  });

  it('finds ids written as plain text inside literal values, but not inside tool arguments', () => {
    expect(
      referenced({
        when: [],
        steps: [
          { do: 'tool', person: PERSON, tool: 'x', args: { list: [DEVICE], deep: { id: ROOM } } },
          set({ device: GROUP }, { name: SCENE, level: 5 }),
          set({ device: GROUP }, [CAMERA]),
          { do: 'value', value: VALUE, op: 'add', amount: { nested: { deeper: [ROOM] } } },
          { do: 'set', target: { device: GROUP }, control: 'power', by: 1, for: 5 },
          set({ device: GROUP }, null),
        ],
      }),
    ).toEqual([PERSON, GROUP, SCENE, CAMERA, VALUE, ROOM].sort());
  });

  it('names what a set step reads its value from', () => {
    expect(
      referenced({
        when: [],
        steps: [
          set({ device: GROUP }, { from: { device: DEVICE, control: 'brightness' } }),
          set({ device: GROUP }, { brightness: { from: { value: VALUE } }, mode: 'night' }),
          set({ device: GROUP }, { brightness: { from: { literal: OTHER_DEVICE } } }),
          set({ device: GROUP }, { brightness: { from: { input: 'level' } } }),
        ],
      }),
    ).toEqual([GROUP, DEVICE, VALUE, OTHER_DEVICE, 'night'].sort());
  });

  it('names what a temporary change is conditioned on', () => {
    expect(
      referenced({
        when: [],
        steps: [
          {
            do: 'set',
            target: { device: GROUP },
            control: 'power',
            to: 1,
            for: 1000,
            while: { compare: { device: DEVICE, control: 'power' }, test: { is: 'eq', to: 1 } },
          },
        ],
      }),
    ).toEqual([GROUP, DEVICE].sort());
  });

  it('names what conditions compare, nested however deep', () => {
    const deep = {
      all: [
        {
          any: [
            {
              not: { compare: { device: DEVICE, control: 'power' }, test: { is: 'eq', to: 1 } },
            },
          ],
        },
        { compare: { value: VALUE }, test: { is: 'in', to: [ROOM, 'text'] } },
        {
          compare: { from: { device: OTHER_DEVICE, control: 'brightness' }, add: 1 },
          test: { is: 'gt', to: 3 },
        },
        { compare: { literal: 5 }, test: { is: 'between', min: 1, max: 9 } },
        { time: { after: '08:00' } },
        { daylight: 'day' },
      ],
    };
    expect(referenced({ when: [], onlyIf: deep, steps: [{ do: 'wait', ms: 1 }] })).toEqual(
      [DEVICE, VALUE, ROOM, OTHER_DEVICE, 'text'].sort(),
    );
  });

  it('names what the branches and loops of a program depend on', () => {
    expect(
      referenced({
        when: [],
        steps: [
          {
            do: 'if',
            branches: [
              {
                when: {
                  compare: { device: DEVICE, control: 'power' },
                  test: { is: 'eq', to: 1 },
                },
                then: [{ do: 'scene', scene: SCENE }],
              },
            ],
            else: [{ do: 'tool', person: PERSON, tool: 'x' }],
          },
          {
            do: 'repeat',
            while: { compare: { value: VALUE }, test: { is: 'gt', to: 1 } },
            steps: [{ do: 'wait', ms: 100 }],
          },
          {
            do: 'repeat',
            until: {
              compare: { device: OTHER_DEVICE, control: 'power' },
              test: { is: 'eq', to: 2 },
            },
            steps: [{ do: 'wait', ms: 100 }],
          },
          { do: 'repeat', times: 2, steps: [{ do: 'wait', ms: 100 }] },
        ],
      }),
    ).toEqual([DEVICE, SCENE, PERSON, VALUE, OTHER_DEVICE].sort());
  });

  it('names the subject and the source of its triggers', () => {
    expect(
      referenced({
        when: [
          { on: 'signal', source: 'plugin', kind: 'event', subject: DEVICE },
          { on: 'signal', source: 'plugin', kind: 'event' },
          { on: 'speech', phrase: 'hello', source: { camera: CAMERA } },
          { on: 'speech', phrase: 'hello', source: { chat: CHAT } },
          { on: 'speech', phrase: 'hello', source: { phone: PERSON } },
          { on: 'speech', phrase: 'hello' },
          { on: 'time', at: '08:00' },
        ],
        steps: [{ do: 'wait', ms: 1 }],
      }),
    ).toEqual([DEVICE, CAMERA, CHAT].sort());
  });

  it('answers whether one id is among them', () => {
    const definition = automation({ when: [], steps: [set({ device: DEVICE })] });
    expect(automationReferences(definition, DEVICE)).toBe(true);
    expect(automationReferences(definition, ROOM)).toBe(false);
  });
});
