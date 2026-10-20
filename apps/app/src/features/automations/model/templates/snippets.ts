import type { FlowNode } from '@smarteverything/domain';
import { MINUTE_MS, lit, maker, wire, type Maker } from './build';
import {
  choicesOf,
  deviceSlot,
  devicesSlot,
  numberSlot,
  readerOf,
  textSlot,
  type Slot,
  type SlotValues,
  type TemplateDevice,
  type Use,
} from './parameters';
import { allLights, idsOf, isReadable, lightsOf, withCapability } from './picks';

export interface SnippetSpec {
  readonly id: string;
  readonly title: string;
  readonly why: string;
  readonly slots: readonly Slot[];
  readonly nodes: (use: Use, m: Maker) => readonly FlowNode[];
}

export interface Snippet extends Omit<SnippetSpec, 'nodes'> {
  readonly build: (values?: SlotValues) => readonly FlowNode[];
}

function snippet(spec: SnippetSpec): Snippet {
  const { nodes, ...rest } = spec;
  return {
    ...rest,
    build: (values = {}) => nodes(readerOf(spec.id, spec.slots, values), maker(spec.id)),
  };
}

const RETRY_ATTEMPTS = 3;
const RETRY_FIRST_WAIT_MS = 2000;
const DOOR_WAIT_MS = 10 * MINUTE_MS;

function lightsSlot(devices: readonly TemplateDevice[]): Slot {
  return devicesSlot('lights', 'Lights', idsOf(lightsOf(devices)), choicesOf(allLights(devices)));
}

function retryThreeTimes(devices: readonly TemplateDevice[]): Snippet {
  return snippet({
    id: 'snippet:retry-3',
    title: 'Retry 3 times',
    why: 'Switches the lights on and tries again, a little later each time, if a device does not answer.',
    slots: [lightsSlot(devices)],
    nodes: (use, m) => [
      m.node(
        'switch',
        'device.set',
        {
          target: lit({ devices: [...use.texts('lights')] }),
          control: lit('power'),
          to: lit(true),
        },
        {
          policy: {
            retry: {
              attempts: RETRY_ATTEMPTS,
              backoff: 'exponential',
              initial: RETRY_FIRST_WAIT_MS,
            },
            acknowledgeRepeat: true,
          },
        },
      ),
    ],
  });
}

function speakOrPush(devices: readonly TemplateDevice[]): Snippet | null {
  const speakers = devices.filter((device) => device.kind === 'speaker');
  const first = speakers[0];
  if (first === undefined) return null;
  return snippet({
    id: 'snippet:speak-or-push',
    title: 'Speak or push',
    why: 'Says a sentence on a speaker and sends it to a phone instead when the speaker cannot be reached.',
    slots: [
      deviceSlot('speaker', 'Speaker', first.id, choicesOf(speakers)),
      textSlot('text', 'What to say', 'Dinner is ready.'),
    ],
    nodes: (use, m) => [
      m.node('say', 'fn.call', {
        fn: lit('builtin.speak_or_push'),
        speaker: lit({ device: use.text('speaker') }),
        people: lit([]),
        text: lit(use.text('text')),
      }),
    ],
  });
}

function lightsOffAfterNoMotion(devices: readonly TemplateDevice[]): Snippet | null {
  const sensor = withCapability(devices, 'motion', isReadable)[0];
  if (sensor === undefined) return null;
  return snippet({
    id: 'snippet:lights-off-after-no-motion',
    title: 'Lights off after no motion',
    why: 'Waits for the room to be quiet, then switches the lights off if it still is.',
    slots: [
      lightsSlot(devices),
      deviceSlot(
        'sensor',
        'Motion sensor',
        sensor.id,
        choicesOf(withCapability(devices, 'motion', isReadable)),
      ),
      numberSlot('minutes', 'Quiet for', 5, { min: 1, max: 120, unit: 'min' }),
    ],
    nodes: (use, m) => [
      m.node('quiet', 'fn.call', {
        fn: lit('builtin.lights_off_after'),
        lights: lit({ devices: [...use.texts('lights')] }),
        sensor: lit(use.text('sensor')),
        after: lit(use.number('minutes') * MINUTE_MS),
      }),
    ],
  });
}

function waitForTheDoor(devices: readonly TemplateDevice[]): Snippet | null {
  const doors = withCapability(devices, 'contact', isReadable);
  const first = doors[0];
  if (first === undefined) return null;
  return snippet({
    id: 'snippet:wait-for-the-door',
    title: 'Wait for the door with a timeout',
    why: 'Pauses until the door is closed and gives up after ten minutes.',
    slots: [deviceSlot('door', 'Door', first.id, choicesOf(doors))],
    nodes: (use, m) => [
      m.node('state', 'device.get', { device: lit(use.text('door')), control: lit('contact') }),
      m.node('isClosed', 'logic.compare', {
        a: wire('state', 'value'),
        op: lit('eq'),
        b: lit(false),
      }),
      m.node('closed', 'flow.wait_condition', {
        condition: wire('isClosed', 'result'),
        timeout: lit(DOOR_WAIT_MS),
      }),
    ],
  });
}

export function snippetsFor(devices: readonly TemplateDevice[]): Snippet[] {
  return [
    retryThreeTimes(devices),
    speakOrPush(devices),
    lightsOffAfterNoMotion(devices),
    waitForTheDoor(devices),
  ].filter((entry) => entry !== null);
}
