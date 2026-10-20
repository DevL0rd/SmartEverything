import { DEVICE_FAMILIES } from '../presentation/types';
import { DEVICE_STATE_CAUSES } from '../signal-sources/device';
import { SUN_MOMENTS } from '../sun';
import type { NodeKind } from './define';
import {
  ANY,
  ANY_RECORD,
  AT,
  DURATION,
  FLAG,
  IGNORE_OWN,
  INSTANT,
  NUMBER,
  TEXT,
  choice,
  input,
  output,
  ref,
  timing,
  trigger,
} from './trigger-parts';
import { SIGNED_MS } from './more-support';
import {
  BUTTON_PRESSES,
  CAMERA_DETECTION_VARIANTS,
  DEVICE_HEALTH_EVENTS,
  RUN_STATUSES,
} from './triggers-device';

const CAUSE_TYPE = choice(DEVICE_STATE_CAUSES);

export const TRIGGER_KINDS: readonly NodeKind[] = [
  trigger({
    id: 'trigger.device',
    name: 'Device changed',
    icon: 'zap',
    description:
      'Starts when a device value changes. Pick one device, or a room, family or role to cover many.',
    inputs: [
      input('device', ref('device'), 'One device.'),
      input('room', ref('room'), 'Every matching device in this room.'),
      input('family', choice(DEVICE_FAMILIES), 'Only this kind of device.'),
      input('role', TEXT, 'Only devices where the value has this role.'),
      input('control', TEXT, 'Which value, for example power or brightness.'),
      input('cause', CAUSE_TYPE, 'Only changes made this way.'),
      ...timing(),
      IGNORE_OWN,
    ],
    outputs: [
      output('device', ref('device'), 'The device that changed.'),
      output('control', TEXT, 'Which value changed.'),
      output('value', ANY, 'The new value.'),
      output('previous', ANY, 'The value before.', true),
      AT,
      output('cause', CAUSE_TYPE, 'What changed it.'),
      output('room', ref('room'), 'The room of the device.', true),
    ],
    summary: 'When {device} {control} changes',
    keywords: ['device', 'change', 'switch', 'light', 'sensor', 'state'],
  }),
  trigger({
    id: 'trigger.signal',
    name: 'Signal',
    icon: 'radio',
    description: 'Starts on any signal in the home, chosen by source and kind.',
    inputs: [
      input('source', TEXT, 'Signal source, for example device, event or weather.', {
        required: true,
      }),
      input('kind', TEXT, 'Signal kind within the source.', { required: true }),
      input('subject', TEXT, 'Only this subject.'),
      input('field', TEXT, 'Only this field.'),
      input('match', ANY_RECORD, 'Details that must match exactly.'),
      ...timing(),
      IGNORE_OWN,
    ],
    outputs: [
      output('source', TEXT, 'The signal source.'),
      output('kind', TEXT, 'The signal kind.'),
      output('subject', TEXT, 'The subject.', true),
      output('field', TEXT, 'The field.', true),
      output('value', ANY, 'The value.'),
      output('previous', ANY, 'The value before.', true),
      output('data', ANY_RECORD, 'The match details of the signal.'),
      AT,
      output('profile', ref('person'), 'The person it belongs to.', true),
    ],
    summary: 'When {kind} arrives from {source}',
    keywords: ['signal', 'event', 'weather', 'provider', 'any'],
  }),
  trigger({
    id: 'trigger.time',
    name: 'Time of day',
    icon: 'clock',
    description: 'Starts at a time of day, on chosen weekdays.',
    inputs: [
      input('at', { t: 'timeOfDay' }, 'The time of day.', { required: true }),
      input(
        'days',
        { t: 'list', of: { t: 'number', integer: true, min: 0, max: 6 } },
        'Weekdays, 0 is Sunday; empty means every day.',
      ),
    ],
    outputs: [
      output('at', INSTANT, 'When it actually started.'),
      output('scheduledFor', INSTANT, 'When it was due.'),
    ],
    summary: 'At {at}',
    keywords: ['time', 'clock', 'schedule', 'daily', 'weekday'],
  }),
  trigger({
    id: 'trigger.interval',
    name: 'Every',
    icon: 'timer-reset',
    description: 'Starts again and again at a fixed interval of at least one minute.',
    inputs: [
      input('every', DURATION, 'How often.', {
        required: true,
        ui: { unit: 'ms', min: 60_000, step: 60_000 },
      }),
      input('alignToClock', FLAG, 'Start on round clock times.', { default: false }),
    ],
    outputs: [
      output('at', INSTANT, 'When it started.'),
      output('tick', { t: 'number', integer: true }, 'How many times it has started.'),
    ],
    summary: 'Every {every}',
    keywords: ['every', 'repeat', 'interval', 'poll', 'minutes'],
  }),
  trigger({
    id: 'trigger.sun',
    name: 'Sun',
    icon: 'sunrise',
    description:
      'Starts at sunrise, sunset, dawn, dusk, solar noon, golden hour or when the sun crosses a height, with an offset. Needs the home location.',
    inputs: [
      input('event', choice(SUN_MOMENTS), 'Which sun event.', { required: true }),
      input('elevation', NUMBER, 'For a height crossing, the sun height in degrees (-18 to 90).', {
        ui: { unit: '°', min: -18, max: 90, step: 1 },
      }),
      input('offset', SIGNED_MS, 'Before (negative) or after the event, up to 12 hours.', {
        default: 0,
        ui: { unit: 'ms', min: -43_200_000, max: 43_200_000, step: 60_000 },
      }),
    ],
    outputs: [
      output('at', INSTANT, 'When it actually started.'),
      output('scheduledFor', INSTANT, 'When it was due.'),
      output('event', TEXT, 'Which sun event.'),
    ],
    summary: 'At {event}',
    keywords: ['sun', 'sunrise', 'sunset', 'dusk', 'dawn', 'daylight'],
  }),
  trigger({
    id: 'trigger.speech',
    name: 'Phrase heard',
    icon: 'mic',
    description: 'Starts when a phrase is spoken to a camera, phone, computer, plugin or chat.',
    inputs: [
      input('phrase', TEXT, 'The words to listen for.', { required: true }),
      input('caseSensitive', FLAG, 'Match capital letters exactly.', { default: false }),
      input('includeBots', FLAG, 'Also react to bots.', { default: false }),
      input(
        'source',
        { t: 'record', values: TEXT },
        'Only from this source (camera, phone, computer, plugin or chat).',
      ),
    ],
    outputs: [
      output('phrase', TEXT, 'The phrase that matched.'),
      output('text', TEXT, 'Everything that was said.'),
      output('speaker', ref('person'), 'Who said it.', true),
      output('source', { t: 'record', values: TEXT }, 'Where it was heard.'),
      AT,
    ],
    summary: 'When "{phrase}" is heard',
    keywords: ['speech', 'voice', 'phrase', 'say', 'wake', 'listen'],
  }),
  trigger({
    id: 'trigger.presence',
    name: 'Person arrives or leaves',
    icon: 'door-open',
    description: 'Starts when a person arrives home or leaves.',
    inputs: [
      input('person', ref('person'), 'One person; empty means anyone.'),
      input('event', choice(['arrived', 'left']), 'Arrived or left.', { default: 'arrived' }),
      input(
        'when',
        choice(['anyone', 'first_arrived', 'everyone_left']),
        'Every time, or only for the first one home or the last one out.',
        { default: 'anyone' },
      ),
      ...timing(),
    ],
    outputs: [
      output('person', ref('person'), 'Who.'),
      output('place', TEXT, 'Where, for example home.'),
      output('event', choice(['arrived', 'left']), 'Arrived or left.'),
      AT,
    ],
    summary: 'When {person} {event}',
    keywords: ['presence', 'arrive', 'leave', 'home', 'away', 'person'],
  }),
  trigger({
    id: 'trigger.camera',
    name: 'Camera sees or hears',
    icon: 'cctv',
    description:
      'Starts when a camera detects motion, a person, a pet, a sound, the doorbell or a call.',
    inputs: [
      input('camera', ref('camera'), 'One camera; empty means any camera.'),
      input('detection', choice(Object.keys(CAMERA_DETECTION_VARIANTS)), 'What it detected.', {
        default: 'motion',
      }),
      ...timing(),
    ],
    outputs: [
      output('camera', ref('camera'), 'The camera.'),
      output('detection', TEXT, 'What it detected.'),
      output('confidence', NUMBER, 'How sure it is.', true),
      AT,
      output('snapshot', TEXT, 'A picture of the moment.', true),
    ],
    summary: 'When {camera} detects {detection}',
    keywords: ['camera', 'motion', 'person', 'pet', 'baby', 'cry', 'sound', 'doorbell'],
  }),
  trigger({
    id: 'trigger.button',
    name: 'Button pressed',
    icon: 'circle-dot',
    description: 'Starts when a button or switch is pressed.',
    inputs: [
      input('device', ref('device'), 'The button.', { required: true }),
      input('press', choice(BUTTON_PRESSES), 'Which kind of press.', { default: 'single_press' }),
    ],
    outputs: [
      output('device', ref('device'), 'The button.'),
      output('press', TEXT, 'The kind of press.'),
      AT,
    ],
    summary: 'When {device} gets a {press}',
    keywords: ['button', 'switch', 'press', 'remote', 'click'],
  }),
  trigger({
    id: 'trigger.called',
    name: 'Started by a person, the AI or another automation',
    icon: 'log-in',
    description:
      'Entry for runs started with Run, by the AI or by another automation. The automation inputs are its outputs.',
    inputs: [],
    outputs: [],
    summary: 'When started on request',
    keywords: ['run', 'manual', 'called', 'button', 'inputs', 'start'],
  }),
  trigger({
    id: 'trigger.value',
    name: 'Variable changed',
    icon: 'variable',
    description: 'Starts when a home Value changes.',
    inputs: [
      input('value', ref('value'), 'The Value.', { required: true }),
      ...timing(),
      IGNORE_OWN,
    ],
    outputs: [
      output('value', ANY, 'The new value.'),
      output('previous', ANY, 'The value before.', true),
      AT,
    ],
    summary: 'When {value} changes',
    keywords: ['value', 'variable', 'mode', 'flag', 'changed'],
  }),
  trigger({
    id: 'trigger.run_status',
    name: 'Automation finished or failed',
    icon: 'octagon-alert',
    description: 'Starts when an automation run ends with a chosen status.',
    inputs: [
      input('automation', ref('automation'), 'One automation; empty means any.'),
      input('status', choice(RUN_STATUSES), 'Which ending.', { default: 'failed' }),
    ],
    outputs: [
      output('automation', ref('automation'), 'The automation.'),
      output('runId', TEXT, 'The run.'),
      output('status', TEXT, 'How it ended.'),
      output('error', { t: 'error' }, 'Why it failed.', true),
      AT,
    ],
    summary: 'When {automation} {status}',
    keywords: ['failed', 'error', 'finished', 'run', 'status', 'monitor'],
  }),
  trigger({
    id: 'trigger.device_health',
    name: 'Device offline or low battery',
    icon: 'wifi-off',
    description: 'Starts when a device goes offline or online, or its battery runs low.',
    inputs: [
      input('device', ref('device'), 'One device.'),
      input('room', ref('room'), 'Every matching device in this room.'),
      input('family', choice(DEVICE_FAMILIES), 'Only this kind of device.'),
      input('event', choice(DEVICE_HEALTH_EVENTS), 'What to watch for.', { default: 'offline' }),
      input(
        'battery',
        { t: 'number', min: 1, max: 100, unit: '%' },
        'Battery level that counts as low.',
        {
          default: 20,
        },
      ),
      ...timing(['hold']),
      IGNORE_OWN,
    ],
    outputs: [
      output('device', ref('device'), 'The device.'),
      output('event', TEXT, 'Offline, online or battery low.'),
      output('battery', NUMBER, 'The battery level.', true),
      AT,
    ],
    summary: 'When {device} is {event}',
    keywords: ['offline', 'online', 'battery', 'health', 'unreachable', 'low'],
  }),
];

export const TRIGGER_KIND_IDS: readonly string[] = TRIGGER_KINDS.map((kind) => kind.id);
