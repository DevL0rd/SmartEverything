import type { BuiltinFunction } from './build';
import {
  FLAG,
  TARGET,
  action,
  builtin,
  kit,
  lit,
  optional,
  output,
  required,
  variable,
  wire,
} from './build';

const { node, when } = kit(3);

const lampsPower = (key: string, to: boolean): ReturnType<typeof node> =>
  node(key, 'device.set', { target: wire('inputs', 'lights'), control: lit('power'), to: lit(to) });

const flag = (key: string, name: string, to: boolean): ReturnType<typeof node> =>
  node(key, 'var.set', { name: lit(name), to: lit(to) });

export const PRESENCE_LIGHTS: BuiltinFunction = builtin(
  'presence_lights',
  1,
  'Presence lights',
  action({
    description:
      'Turns the room lights on when someone is there, it is dark and they are off, and turns them off again only if this switched them on.',
    category: 'lights',
    icon: 'scan-eye',
    inputs: [
      required(
        'lights',
        TARGET,
        'The lights that follow presence, usually the lights of one room.',
      ),
      required('occupied', FLAG, 'Whether someone is in the room now.'),
      optional(
        'darkSensor',
        { t: 'optional', of: { t: 'ref', of: 'device' } },
        'A light sensor; without one the room counts as dark.',
      ),
      optional(
        'allowed',
        FLAG,
        'Whether the lights may be switched on now, for example inside a time window.',
        true,
      ),
      optional('autoOn', FLAG, 'Whether the lights were switched on by this node earlier.', false),
    ],
    outputs: [
      output('turnedOn', FLAG, 'Whether this call switched the lights on.'),
      output(
        'autoOn',
        FLAG,
        'Whether the lights are now on because of presence; keep it for the next call.',
      ),
    ],
    variables: [
      variable('dark', FLAG, lit(true)),
      variable('turnedOn', FLAG, lit(false)),
      variable('autoOn', FLAG, wire('inputs', 'autoOn')),
    ],
    body: [
      when(
        'presence',
        wire('inputs', 'occupied'),
        [
          node('hasSensor', 'logic.exists', { value: wire('inputs', 'darkSensor') }),
          when('sensorKnown', wire('hasSensor', 'result'), [
            node('sensor', 'logic.coalesce', { a: wire('inputs', 'darkSensor') }),
            node('light', 'device.get', {
              device: wire('sensor', 'value'),
              control: lit('illumination'),
            }),
            node('isDark', 'logic.compare', {
              a: wire('light', 'value'),
              op: lit('eq'),
              b: lit('dark'),
            }),
            node('darkNow', 'var.set', { name: lit('dark'), to: wire('isDark', 'result') }),
          ]),
          node('lamps', 'device.aggregate', {
            target: wire('inputs', 'lights'),
            control: lit('power'),
            fn: lit('any'),
            matches: lit(true),
          }),
          node('lampsOn', 'logic.compare', {
            a: wire('lamps', 'value'),
            op: lit('eq'),
            b: lit(true),
          }),
          node('lampsOff', 'logic.not', { flag: wire('lampsOn', 'result') }),
          node('mayTurnOn', 'logic.and', {
            a: wire('vars', 'dark'),
            b: wire('lampsOff', 'result'),
            c: wire('inputs', 'allowed'),
          }),
          when('turnOn', wire('mayTurnOn', 'result'), [
            lampsPower('on', true),
            flag('markAuto', 'autoOn', true),
            flag('markTurned', 'turnedOn', true),
          ]),
        ],
        [
          when('turnOff', wire('vars', 'autoOn'), [
            lampsPower('off', false),
            flag('clearAuto', 'autoOn', false),
          ]),
        ],
      ),
      node('result', 'flow.return', {
        turnedOn: wire('vars', 'turnedOn'),
        autoOn: wire('vars', 'autoOn'),
      }),
    ],
  }),
);
