import type { BuiltinFunction } from './build';
import {
  NUMBER,
  PEOPLE,
  TARGET,
  TEXT,
  action,
  builtin,
  kit,
  lit,
  optional,
  output,
  variable,
  required,
  wire,
} from './build';

const flash = kit(10);

export const DOORBELL_FLASH: BuiltinFunction = builtin(
  'doorbell_flash',
  1,
  'Flash the lights',
  action({
    description:
      'Remembers the lights, flashes them in a colour a few times, and puts them back as they were.',
    category: 'lights',
    icon: 'bell-ring',
    inputs: [
      required('lights', TARGET, 'The lights to flash.'),
      required('color', { t: 'color' }, 'The colour to flash.'),
      optional('times', { t: 'number', integer: true, min: 1 }, 'How many flashes.', 3),
    ],
    outputs: [],
    body: [
      flash.node('saved', 'device.snapshot', { target: wire('inputs', 'lights') }),
      flash.node(
        'flashes',
        'flow.repeat',
        { times: wire('inputs', 'times') },
        {
          scopes: {
            body: {
              nodes: [
                flash.node('colour', 'device.set', {
                  target: wire('inputs', 'lights'),
                  control: lit('color'),
                  to: wire('inputs', 'color'),
                }),
                flash.node('lit', 'flow.wait', { duration: lit(500) }),
                flash.node('dark', 'device.set', {
                  target: wire('inputs', 'lights'),
                  control: lit('power'),
                  to: lit(false),
                }),
                flash.node('rest', 'flow.wait', { duration: lit(500) }),
              ],
            },
          },
        },
      ),
      flash.node('back', 'device.restore', { snapshot: wire('saved', 'snapshot') }),
    ],
  }),
);

const wake = kit(11);

export const WAKE_UP_LIGHT: BuiltinFunction = builtin(
  'wake_up_light',
  1,
  'Wake-up light',
  action({
    description: 'Starts the lights at one percent in warm white and brightens them to full.',
    category: 'lights',
    icon: 'sunrise',
    inputs: [
      required('lights', TARGET, 'The lights to wake you with.'),
      required('over', { t: 'duration' }, 'How long the sunrise takes.'),
      optional('kelvin', NUMBER, 'The warm white to start from.', 2700),
    ],
    outputs: [],
    body: [
      wake.node('on', 'device.set', {
        target: wire('inputs', 'lights'),
        control: lit('power'),
        to: lit(true),
      }),
      wake.node('warm', 'device.set', {
        target: wire('inputs', 'lights'),
        control: lit('color_temperature'),
        to: wire('inputs', 'kelvin'),
      }),
      wake.node('dim', 'device.set', {
        target: wire('inputs', 'lights'),
        control: lit('brightness'),
        to: lit(1),
      }),
      wake.node('rise', 'device.fade', {
        target: wire('inputs', 'lights'),
        control: lit('brightness'),
        from: lit(1),
        to: lit(100),
        over: wire('inputs', 'over'),
      }),
    ],
  }),
);

const leave = kit(12);

export const LEAVE_HOME_CHECK: BuiltinFunction = builtin(
  'leave_home_check',
  1,
  'Leave home check',
  action({
    description:
      'Switches the lights off, finds the windows and doors still open, and tells the people what was left open.',
    category: 'presence',
    icon: 'door-open',
    inputs: [
      required('people', PEOPLE, 'The people to tell.'),
      required('lights', TARGET, 'The lights to switch off.'),
      required('openings', TARGET, 'The window and door sensors to check.'),
    ],
    outputs: [output('openItems', { t: 'list', of: TEXT }, 'The openings that were still open.')],
    variables: [variable('openItems', { t: 'list', of: TEXT }, lit([]))],
    body: [
      leave.node('open', 'device.aggregate', {
        target: wire('inputs', 'openings'),
        control: lit('contact'),
        fn: lit('any'),
        matches: lit(true),
      }),
      leave.node('off', 'device.set', {
        target: wire('inputs', 'lights'),
        control: lit('power'),
        to: lit(false),
      }),
      leave.node(
        'each',
        'flow.for_each',
        { items: wire('open', 'matching') },
        {
          scopes: {
            body: {
              nodes: [
                leave.node('label', 'text.format', {
                  template: lit('{a}'),
                  a: wire('each', 'item'),
                }),
                leave.node('note', 'var.change', {
                  name: lit('openItems'),
                  op: lit('append'),
                  amount: wire('label', 'text'),
                }),
              ],
            },
          },
        },
      ),
      leave.node('names', 'text.join', {
        items: wire('vars', 'openItems'),
        lastSeparator: lit(' and '),
      }),
      leave.node('anyOpen', 'logic.compare', {
        a: wire('open', 'count'),
        op: lit('gt'),
        b: lit(0),
      }),
      leave.when('left', wire('anyOpen', 'result'), [
        leave.node('message', 'text.format', {
          template: lit('Still open: {a}. The lights are off.'),
          a: wire('names', 'text'),
        }),
        leave.node('tell', 'notify.person', {
          people: wire('inputs', 'people'),
          title: lit('Before you go'),
          body: wire('message', 'text'),
        }),
      ]),
      leave.node('result', 'flow.return', {
        openItems: wire('vars', 'openItems'),
      }),
    ],
  }),
);

const askKit = kit(13);
const HOUR_MS = 3_600_000;

export const ASK_THEN_ACT: BuiltinFunction = builtin(
  'ask_then_act',
  1,
  'Ask, then act',
  action({
    description:
      'Asks a person a yes or no question and leaves by the yes, no or timed out exit so the next steps can act on the answer.',
    category: 'notify',
    icon: 'message-circle-question',
    inputs: [
      required('person', { t: 'ref', of: 'person' }, 'Who to ask.'),
      required('question', TEXT, 'The question to ask.'),
    ],
    outputs: [],
    exits: ['yes', 'no', 'timedOut'],
    body: [
      askKit.node(
        'ask',
        'notify.ask',
        {
          person: wire('inputs', 'person'),
          question: wire('inputs', 'question'),
          options: lit(['Yes', 'No']),
          timeout: lit(HOUR_MS),
        },
        {
          scopes: {
            timedOut: { nodes: [askKit.node('gaveUp', 'flow.return', { exit: lit('timedOut') })] },
          },
        },
      ),
      askKit.node('yesAnswer', 'logic.compare', {
        a: wire('ask', 'answer'),
        op: lit('eq'),
        b: lit('Yes'),
      }),
      askKit.when(
        'agreed',
        wire('yesAnswer', 'result'),
        [askKit.node('said', 'flow.return', { exit: lit('yes') })],
        [askKit.node('declined', 'flow.return', { exit: lit('no') })],
      ),
    ],
  }),
);
