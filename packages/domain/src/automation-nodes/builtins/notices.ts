import type { BuiltinFunction } from './build';
import {
  FLAG,
  PEOPLE,
  TARGET,
  TEXT,
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

const speak = kit(4);

export const SPEAK_OR_PUSH: BuiltinFunction = builtin(
  'speak_or_push',
  1,
  'Say it, or push it',
  action({
    description:
      'Says the text on a speaker; when the speaker cannot be reached, sends it to the people as a notification.',
    category: 'notify',
    icon: 'megaphone',
    inputs: [
      required('speaker', TARGET, 'The speaker to talk on.'),
      required('people', PEOPLE, 'The people to notify when the speaker is unreachable.'),
      required('text', TEXT, 'What to say.'),
    ],
    outputs: [output('spoken', FLAG, 'Whether the speaker said it.')],
    variables: [variable('spoken', FLAG, lit(false))],
    body: [
      speak.attempt(
        'try',
        [
          speak.node('say', 'notify.speak', {
            target: wire('inputs', 'speaker'),
            text: wire('inputs', 'text'),
          }),
          speak.node('said', 'var.set', { name: lit('spoken'), to: wire('say', 'ok') }),
        ],
        ['Unreachable'],
        [
          speak.node('push', 'notify.person', {
            people: wire('inputs', 'people'),
            title: lit('Home'),
            body: wire('inputs', 'text'),
          }),
        ],
      ),
      speak.node('result', 'flow.return', { spoken: wire('vars', 'spoken') }),
    ],
  }),
);

const notice = kit(5);

export const APPLIANCE_NOTICE: BuiltinFunction = builtin(
  'appliance_notice',
  1,
  'Appliance notice',
  action({
    description:
      'Tells the people an appliance has something to say: a push notification, or only a line in the activity feed.',
    category: 'notify',
    icon: 'bell',
    inputs: [
      required('device', { t: 'ref', of: 'device' }, 'The appliance the notice is about.'),
      required('people', PEOPLE, 'The people to notify when a push is wanted.'),
      required('message', TEXT, 'What happened.'),
      optional('sendPush', FLAG, 'Send a push notification instead of only a feed line.', false),
    ],
    outputs: [],
    body: [
      notice.node('now', 'date.now'),
      notice.node('when', 'date.format', { instant: wire('now', 'at') }),
      notice.when(
        'route',
        wire('inputs', 'sendPush'),
        [
          notice.node('title', 'text.format', {
            template: lit('{a}'),
            a: wire('inputs', 'device'),
          }),
          notice.node('text', 'text.format', {
            template: lit('{a} ({b})'),
            a: wire('inputs', 'message'),
            b: wire('when', 'text'),
          }),
          notice.node('push', 'notify.person', {
            people: wire('inputs', 'people'),
            title: wire('title', 'text'),
            body: wire('text', 'text'),
          }),
        ],
        [
          notice.node('line', 'text.format', {
            template: lit('{a}: {b} ({c})'),
            a: wire('inputs', 'device'),
            b: wire('inputs', 'message'),
            c: wire('when', 'text'),
          }),
          notice.node('feed', 'notify.feed', { message: wire('line', 'text') }),
        ],
      ),
    ],
  }),
);
