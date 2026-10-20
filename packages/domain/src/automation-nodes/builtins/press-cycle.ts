import type { BuiltinFunction } from './build';
import {
  NUMBER,
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

const { node, when } = kit(1);

export const PRESS_CYCLE_BRIGHTNESS: BuiltinFunction = builtin(
  'press_cycle_brightness',
  1,
  'Press cycles brightness',
  action({
    description:
      'Moves the lights to the next brightness step; the step after the last one turns them off, and the first step is warm white.',
    category: 'lights',
    icon: 'lightbulb',
    inputs: [
      required('lights', TARGET, 'The lights to change.'),
      optional('step', NUMBER, 'The step the lights are on now, 0 when off.', 0),
      optional(
        'levels',
        { t: 'list', of: NUMBER },
        'The brightness of each step.',
        [1, 25, 50, 75, 100],
      ),
      optional('warmKelvin', NUMBER, 'The colour temperature of the first step.', 2700),
    ],
    outputs: [
      output('step', NUMBER, 'The step the lights are on now, 0 when off.'),
      output('level', NUMBER, 'The brightness now, 0 when off.'),
    ],
    variables: [variable('level', NUMBER, lit(0))],
    body: [
      node('countLevels', 'list.length', { list: wire('inputs', 'levels') }),
      node('stepCount', 'math.add', { a: wire('countLevels', 'length'), b: lit(1) }),
      node('plusOne', 'math.add', { a: wire('inputs', 'step'), b: lit(1) }),
      node('next', 'math.modulo', { a: wire('plusOne', 'result'), b: wire('stepCount', 'result') }),
      node('isOff', 'logic.compare', { a: wire('next', 'result'), op: lit('eq'), b: lit(0) }),
      when(
        'wrap',
        wire('isOff', 'result'),
        [
          node('off', 'device.set', {
            target: wire('inputs', 'lights'),
            control: lit('power'),
            to: lit(false),
          }),
        ],
        [
          node('position', 'math.subtract', { a: wire('next', 'result'), b: lit(1) }),
          node('levelAt', 'list.get', {
            list: wire('inputs', 'levels'),
            index: wire('position', 'result'),
          }),
          node('pick', 'var.set', { name: lit('level'), to: wire('levelAt', 'item') }),
          node('dim', 'device.set', {
            target: wire('inputs', 'lights'),
            control: lit('brightness'),
            to: wire('levelAt', 'item'),
          }),
          node('isFirst', 'logic.compare', { a: wire('next', 'result'), op: lit('eq'), b: lit(1) }),
          when('warm', wire('isFirst', 'result'), [
            node('white', 'device.set', {
              target: wire('inputs', 'lights'),
              control: lit('color_temperature'),
              to: wire('inputs', 'warmKelvin'),
            }),
          ]),
        ],
      ),
      node('result', 'flow.return', { step: wire('next', 'result'), level: wire('vars', 'level') }),
    ],
  }),
);

const reset = kit(2);

export const LONG_PRESS_RESET: BuiltinFunction = builtin(
  'long_press_reset',
  1,
  'Long press turns lights off',
  action({
    description: 'Turns the lights off and sends the brightness cycle back to step 0.',
    category: 'lights',
    icon: 'power',
    inputs: [required('lights', TARGET, 'The lights to turn off.')],
    outputs: [output('step', NUMBER, 'The step to keep, always 0.')],
    body: [
      reset.node('off', 'device.set', {
        target: wire('inputs', 'lights'),
        control: lit('power'),
        to: lit(false),
      }),
      reset.node('result', 'flow.return', { step: lit(0) }),
    ],
  }),
);
