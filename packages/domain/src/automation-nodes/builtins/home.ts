import type { FlowType } from '../../automation-v3/types';
import { WEATHER_KINDS, WEATHER_KIND_LABELS } from '../../weather/conditions';
import type { BuiltinFunction } from './build';
import {
  COUNT,
  FLAG,
  NUMBER,
  TARGET,
  TEXT,
  action,
  builtin,
  kit,
  lit,
  output,
  required,
  variable,
  wire,
} from './build';

const timed = kit(6);

export const TIMED_DEVICES: BuiltinFunction = builtin(
  'timed_devices',
  1,
  'Switch devices',
  action({
    description:
      'Switches a set of devices on or off and reports which ones were reached and which were skipped.',
    category: 'devices',
    icon: 'power',
    inputs: [
      required('devices', TARGET, 'The devices to switch.'),
      required('on', FLAG, 'On or off.'),
    ],
    outputs: [
      output(
        'sent',
        { t: 'list', of: { t: 'ref', of: 'device' } },
        'The devices that were switched.',
      ),
      output(
        'skipped',
        {
          t: 'list',
          of: { t: 'record', fields: { device: { t: 'ref', of: 'device' }, reason: TEXT } },
        },
        'The devices that were left alone, with the reason.',
      ),
    ],
    body: [
      timed.node('switch', 'device.set', {
        target: wire('inputs', 'devices'),
        control: lit('power'),
        to: wire('inputs', 'on'),
      }),
      timed.node('result', 'flow.return', {
        sent: wire('switch', 'sent'),
        skipped: wire('switch', 'skipped'),
      }),
    ],
  }),
);

const average = kit(7);

export const AVERAGE_IN_ROOM: BuiltinFunction = builtin(
  'average_in_room',
  1,
  'Average in a room',
  action({
    description: 'Gives the average temperature of the devices in a room that report one.',
    category: 'devices',
    icon: 'gauge',
    inputs: [required('devices', TARGET, 'The devices to read, usually the sensors of one room.')],
    outputs: [
      {
        name: 'average',
        type: NUMBER,
        optional: true,
        description: 'The average, absent when no device reports it.',
      },
      output('count', COUNT, 'How many devices reported it.'),
    ],
    body: [
      average.node('read', 'device.aggregate', {
        target: wire('inputs', 'devices'),
        control: lit('temperature'),
        fn: lit('average'),
      }),
      average.node('any', 'logic.compare', { a: wire('read', 'count'), op: lit('gt'), b: lit(0) }),
      average.when(
        'reported',
        wire('any', 'result'),
        [
          average.node('some', 'flow.return', {
            average: wire('read', 'value'),
            count: wire('read', 'count'),
          }),
        ],
        [average.node('none', 'flow.return', { count: lit(0) })],
      ),
    ],
  }),
);

const WEATHER_KIND: FlowType = {
  t: 'choice',
  options: WEATHER_KINDS.map((kind) => ({ id: kind, label: WEATHER_KIND_LABELS[kind] })),
};

const look = kit(8);

export const WEATHER_LOOK: BuiltinFunction = builtin(
  'weather_look',
  2,
  'Weather look',
  action({
    description: 'Runs a scene when the weather now is one of the chosen kinds.',
    category: 'weather',
    icon: 'cloud-sun',
    inputs: [
      required(
        'kinds',
        { t: 'list', of: WEATHER_KIND },
        'The kinds of weather that call for the look.',
      ),
      required('look', { t: 'ref', of: 'scene' }, 'The scene to run.'),
    ],
    outputs: [output('applied', FLAG, 'Whether the scene ran.')],
    variables: [variable('applied', FLAG, lit(false))],
    body: [
      look.node('weather', 'weather.read'),
      look.node('match', 'logic.in', {
        value: wire('weather', 'kind'),
        list: wire('inputs', 'kinds'),
      }),
      look.when('matches', wire('match', 'result'), [
        look.node('scene', 'scene.run', { scene: wire('inputs', 'look') }),
        look.node('ran', 'var.set', { name: lit('applied'), to: wire('scene', 'ok') }),
      ]),
      look.node('result', 'flow.return', { applied: wire('vars', 'applied') }),
    ],
  }),
);

const off = kit(9);

export const LIGHTS_OFF_AFTER: BuiltinFunction = builtin(
  'lights_off_after',
  1,
  'Lights off after no motion',
  action({
    description:
      'Waits until a motion sensor is quiet, waits the given time, and turns the lights off if it is still quiet.',
    category: 'lights',
    icon: 'timer',
    inputs: [
      required('lights', TARGET, 'The lights to turn off.'),
      required('sensor', { t: 'ref', of: 'device' }, 'The motion sensor to watch.'),
      required('after', { t: 'duration' }, 'How long the room must stay quiet.'),
    ],
    outputs: [output('turnedOff', FLAG, 'Whether the lights were turned off.')],
    variables: [variable('turnedOff', FLAG, lit(false))],
    body: [
      off.node('first', 'device.get', { device: wire('inputs', 'sensor'), control: lit('motion') }),
      off.node('moving', 'logic.compare', {
        a: wire('first', 'value'),
        op: lit('eq'),
        b: lit(true),
      }),
      off.node('still', 'logic.not', { flag: wire('moving', 'result') }),
      off.node('quiet', 'flow.wait_condition', { condition: wire('still', 'result') }),
      off.node('pause', 'flow.wait', { duration: wire('inputs', 'after') }),
      off.node('second', 'device.get', {
        device: wire('inputs', 'sensor'),
        control: lit('motion'),
      }),
      off.node('movingAgain', 'logic.compare', {
        a: wire('second', 'value'),
        op: lit('eq'),
        b: lit(true),
      }),
      off.node('stillAgain', 'logic.not', { flag: wire('movingAgain', 'result') }),
      off.when('stillQuiet', wire('stillAgain', 'result'), [
        off.node('off', 'device.set', {
          target: wire('inputs', 'lights'),
          control: lit('power'),
          to: lit(false),
        }),
        off.node('done', 'var.set', { name: lit('turnedOff'), to: lit(true) }),
      ]),
      off.node('result', 'flow.return', { turnedOff: wire('vars', 'turnedOff') }),
    ],
  }),
);
