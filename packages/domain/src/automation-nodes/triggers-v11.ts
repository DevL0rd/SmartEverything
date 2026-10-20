import { humanizeEnum } from '../presentation/humanize';
import { RAIN_HORIZONS, WEATHER_SIGNAL_METRICS } from '../weather/signal-metrics';
import { WET_KINDS } from '../weather/conditions';
import type { NodeKind } from './define';
import {
  ANY,
  ANY_RECORD,
  AT,
  DURATION,
  FLAG,
  INSTANT,
  TEXT,
  choice,
  input,
  output,
  ref,
  timing,
  trigger,
} from './trigger-parts';
import {
  CHAT_OUTCOMES,
  COMPUTER_TRIGGER_EVENTS,
  HEALTH_TRIGGER_KINDS,
  PHONE_TRIGGER_EVENTS,
  WEATHER_TRIGGER_EVENTS,
} from './triggers-v11-signals';

const BECOMES_TRUE = trigger({
  id: 'trigger.becomes_true',
  name: 'Condition becomes true',
  icon: 'toggle-right',
  description:
    'Starts when a condition changes from false to true. It is checked when something it reads changes, never on a timer, and it can read the read and calculation steps at the start of the program.',
  inputs: [
    {
      name: 'condition',
      type: FLAG,
      required: true,
      live: true,
      description: 'The condition to watch, for example a room above 26 degrees and someone home.',
    },
    ...timing(['hold']),
  ],
  outputs: [AT],
  summary: 'When the condition becomes true',
  keywords: ['condition', 'becomes true', 'when', 'above', 'below', 'crosses', 'edge', 'rises'],
});

const COMPUTER = trigger({
  id: 'trigger.computer',
  name: 'Computer event',
  icon: 'monitor',
  description:
    'Starts when an app opens or comes to the front on a computer, or its power changes.',
  inputs: [
    input('computer', ref('device'), 'One computer; empty means any computer.'),
    input('kind', choice(Object.keys(COMPUTER_TRIGGER_EVENTS)), 'What happened.', {
      default: 'app_open',
    }),
    input('app', TEXT, 'Only this app, by name.'),
    input('title', TEXT, 'Only this window title.'),
    ...timing(['cooldown']),
  ],
  outputs: [
    output('computer', ref('device'), 'The computer.'),
    output('kind', TEXT, 'What happened.'),
    output('app', TEXT, 'The app.', true),
    output('title', TEXT, 'The window title.', true),
    output('action', TEXT, 'The power action.', true),
    AT,
  ],
  summary: 'When {computer} has {kind}',
  keywords: ['computer', 'pc', 'app', 'game', 'steam', 'open', 'focus', 'power'],
});

const PHONE = trigger({
  id: 'trigger.phone',
  name: 'Phone event',
  icon: 'smartphone',
  description: 'Starts when a phone is unlocked, changes what it is doing, or parks.',
  inputs: [
    input('phone', ref('device'), 'One phone; empty means any phone.'),
    input('kind', choice(Object.keys(PHONE_TRIGGER_EVENTS)), 'What happened.', {
      default: 'unlocked',
    }),
    input('to', TEXT, 'For a change of activity, only when it became this.'),
    input('from', TEXT, 'For a change of activity, only when it was this before.'),
    ...timing(['cooldown']),
  ],
  outputs: [
    output('phone', ref('device'), 'The phone.'),
    output('kind', TEXT, 'What happened.'),
    output('data', ANY_RECORD, 'The details of the event.'),
    AT,
  ],
  summary: 'When {phone} is {kind}',
  keywords: ['phone', 'unlock', 'unlocked', 'driving', 'walking', 'parked', 'context'],
});

const HEALTH = trigger({
  id: 'trigger.health',
  name: 'Health reading',
  icon: 'heart-pulse',
  description: 'Starts on a scale reading, a daily total, something logged, or when sleep ends.',
  inputs: [
    input('kind', choice(HEALTH_TRIGGER_KINDS), 'What kind of health signal.', {
      default: 'sleep_ended',
    }),
    input('person', ref('person'), 'One person; empty means anyone.'),
    input('metric', TEXT, 'Which reading, total or logged type, for example weight_kg.'),
    ...timing(['test', 'window', 'cooldown', 'first']),
  ],
  outputs: [
    output('kind', TEXT, 'What kind of health signal.'),
    output('metric', TEXT, 'Which reading or total.', true),
    output('value', ANY, 'The value.', true),
    output('person', ref('person'), 'Whose.', true),
    output('data', ANY_RECORD, 'The details of the signal.'),
    AT,
  ],
  summary: 'When {kind} arrives for {person}',
  keywords: ['health', 'sleep', 'woke', 'weight', 'scale', 'heart', 'steps', 'reading'],
});

const WEATHER = trigger({
  id: 'trigger.weather',
  name: 'Weather changes',
  icon: 'cloud-rain',
  description:
    'Starts the moment new weather arrives and something changed: a value (changed, with a test such as above 25 and rearm for crossing), a band (band, for example the temperature turning hot), the condition (condition), rain starting or stopping, rain expected within a time, or any forecast update. Nothing changed means no start.',
  inputs: [
    input('event', choice(WEATHER_TRIGGER_EVENTS), 'What changed.', { default: 'changed' }),
    input('metric', choice(WEATHER_SIGNAL_METRICS), 'Which value, for changed and band.'),
    input('to', TEXT, 'For band or condition, only when it became this.'),
    input('from', TEXT, 'For band or condition, only when it was this before.'),
    input('falling', choice([...WET_KINDS]), 'For rain started, only this kind of weather.'),
    input('within', choice(RAIN_HORIZONS), 'For rain expected, how soon.'),
    ...timing(['test', 'rearm', 'hold', 'debounce', 'cooldown']),
  ],
  outputs: [
    output('event', TEXT, 'What changed.'),
    output('metric', TEXT, 'Which value changed.', true),
    output('value', ANY, 'The new value, band or condition.', true),
    output('previous', ANY, 'The value before.', true),
    output('data', ANY_RECORD, 'The details of the change.'),
    AT,
  ],
  summary: 'When the weather {event}',
  keywords: [
    'weather',
    'rain',
    'raining',
    'snow',
    'storm',
    'temperature',
    'wind',
    'uv',
    'humidity',
    'forecast',
    'outside',
  ],
});

const CHAT = trigger({
  id: 'trigger.chat',
  name: 'Assistant or chat',
  icon: 'message-square',
  description: 'Starts when the AI finishes a reply in a chat.',
  inputs: [
    input('chat', TEXT, 'One chat; empty means any chat.'),
    input('outcome', choice(CHAT_OUTCOMES), 'How the reply ended; empty means either.'),
    ...timing(['cooldown']),
  ],
  outputs: [
    output('chat', TEXT, 'The chat.'),
    output(
      'outcome',
      choice(CHAT_OUTCOMES),
      `How the reply ended: ${CHAT_OUTCOMES.map(humanizeEnum).join(' or ')}.`,
    ),
    output('messageId', TEXT, 'The reply.', true),
    output('person', ref('person'), 'Whose chat it is.', true),
    AT,
  ],
  summary: 'When the AI finishes a reply',
  keywords: ['assistant', 'ai', 'chat', 'reply', 'answer', 'message'],
});

const EVENT = trigger({
  id: 'trigger.event',
  name: 'Custom event',
  icon: 'megaphone',
  description: 'Starts when an automation sends a named event with the Send event step.',
  inputs: [
    input('name', TEXT, 'The name of the event, for example guest_mode_on.', { required: true }),
    ...timing(['cooldown']),
  ],
  outputs: [
    output('name', TEXT, 'The name of the event.'),
    output('payload', ANY_RECORD, 'The data sent with the event.'),
    AT,
  ],
  summary: 'When the event {name} is sent',
  keywords: ['event', 'signal', 'custom', 'broadcast', 'message'],
});

const TIMER = trigger({
  id: 'trigger.timer',
  name: 'Timer finished',
  icon: 'alarm-clock',
  description: 'Starts when a named timer ends. The timer is started with the Timer step.',
  inputs: [input('timer', TEXT, 'The name of the timer.', { required: true })],
  outputs: [output('timer', TEXT, 'The name of the timer.'), AT],
  summary: 'When the timer {timer} ends',
  keywords: ['timer', 'countdown', 'alarm', 'finished', 'done', 'laundry'],
});

const HUB_STARTED = trigger({
  id: 'trigger.hub_started',
  name: 'Hub started',
  icon: 'power',
  description: 'Starts once each time the home hub starts.',
  inputs: [],
  outputs: [output('downFor', DURATION, 'How long the hub was off.', true), AT],
  summary: 'When the hub starts',
  keywords: ['hub', 'start', 'restart', 'boot', 'reboot', 'power'],
});

const WEBHOOK = trigger({
  id: 'trigger.webhook',
  name: 'Webhook',
  icon: 'webhook',
  description:
    'Starts when the secret web address /hooks/<path> of the hub is called, for example from another service. Only the owner can use it.',
  inputs: [
    input(
      'path',
      TEXT,
      'The secret of this webhook: 16 to 128 letters, digits, dashes or underscores. It is called at /hooks/<path> on the hub.',
      { required: true },
    ),
    input('method', choice(['GET', 'POST', 'PUT', 'DELETE']), 'Only this method; empty means any.'),
  ],
  outputs: [
    output('method', TEXT, 'The method of the call.'),
    output('body', ANY, 'The body of the call.', true),
    output('headers', { t: 'record', values: TEXT }, 'The headers of the call.'),
    output('query', { t: 'record', values: TEXT }, 'The query of the call.'),
    AT,
  ],
  summary: 'When the webhook is called',
  keywords: ['webhook', 'http', 'ifttt', 'call', 'url', 'api'],
});

const WEBHOOK_OWNER: NodeKind = { ...WEBHOOK, access: 'owner' };

const SCHEDULE = trigger({
  id: 'trigger.schedule',
  name: 'Schedule',
  icon: 'calendar-days',
  description:
    'Starts at the start of each block of a weekly plan, with the block data, skipping days you choose.',
  inputs: [
    input(
      'blocks',
      { t: 'list', of: ANY_RECORD },
      'The blocks, each with a time (at), weekdays (days) and any data (slot).',
      { required: true },
    ),
    input('except', { t: 'list', of: TEXT }, 'Dates to skip, as YYYY-MM-DD.'),
  ],
  outputs: [
    output('slot', ANY, 'The data of the block that started.', true),
    output('scheduledFor', INSTANT, 'When it was due.'),
    AT,
  ],
  summary: 'At each block of the schedule',
  keywords: ['schedule', 'weekly', 'plan', 'heating', 'blocks', 'calendar', 'holiday'],
});

export const TRIGGER_V11_KINDS: readonly NodeKind[] = [
  BECOMES_TRUE,
  COMPUTER,
  PHONE,
  HEALTH,
  WEATHER,
  CHAT,
  EVENT,
  TIMER,
  HUB_STARTED,
  WEBHOOK_OWNER,
  SCHEDULE,
];
