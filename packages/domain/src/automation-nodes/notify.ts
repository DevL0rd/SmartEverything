import { defineNodeKind, type NodeKind } from './define';

const PERSON_LIST = { t: 'list', of: { t: 'ref', of: 'person' } } as const;

const PRIORITY_OPTIONS = [
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'High' },
  { id: 'urgent', label: 'Urgent' },
] as const;

export const NOTIFY_PERSON = defineNodeKind({
  id: 'notify.person',
  name: 'Send to phone',
  category: 'notify',
  icon: 'bell-ring',
  class: 'effect',
  description: 'Sends a note to people in their chat and as a push message to their phone.',
  inputs: [
    {
      name: 'people',
      type: PERSON_LIST,
      required: true,
      description: 'Who to tell.',
      summary: true,
    },
    {
      name: 'title',
      type: { t: 'text' },
      required: true,
      live: true,
      description: 'The headline of the message.',
      summary: true,
    },
    {
      name: 'body',
      type: { t: 'text' },
      required: true,
      live: true,
      description: 'The text of the message.',
    },
    {
      name: 'image',
      type: { t: 'optional', of: { t: 'text' } },
      required: false,
      description: 'A picture to show with the message.',
    },
    {
      name: 'priority',
      type: { t: 'choice', options: PRIORITY_OPTIONS.map((option) => ({ ...option })) },
      required: false,
      default: 'normal',
      static: true,
      description: 'How loudly the phone announces it.',
    },
    {
      name: 'tag',
      type: { t: 'optional', of: { t: 'text' } },
      required: false,
      static: true,
      description: 'A later message with the same tag replaces the earlier one.',
    },
    {
      name: 'link',
      type: { t: 'optional', of: { t: 'text' } },
      required: false,
      static: true,
      description: 'The page the message opens.',
    },
    {
      name: 'sound',
      type: { t: 'optional', of: { t: 'text' } },
      required: false,
      static: true,
      description: 'The sound the phone plays.',
    },
  ],
  outputs: [
    { name: 'sent', type: PERSON_LIST, description: 'The people who were notified.' },
    { name: 'failed', type: PERSON_LIST, description: 'The people who could not be notified.' },
  ],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects_person' },
  summary: 'Send {title} to {people}',
  keywords: ['notification', 'push', 'phone', 'message', 'alert', 'tell'],
  access: 'member',
  tier: 'v1',
});

export const NOTIFY_FEED = defineNodeKind({
  id: 'notify.feed',
  name: 'Activity feed note',
  category: 'notify',
  icon: 'scroll-text',
  class: 'effect',
  description: 'Writes a note to the activity feed. It does not send a push message.',
  inputs: [
    {
      name: 'message',
      type: { t: 'text' },
      required: true,
      live: true,
      description: 'The text of the note.',
      summary: true,
    },
  ],
  outputs: [],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects' },
  summary: 'Note {message} in the feed',
  keywords: ['log', 'activity', 'history', 'note'],
  access: 'member',
  tier: 'v1',
});

export const NOTIFY_SPEAK = defineNodeKind({
  id: 'notify.speak',
  name: 'Speak',
  category: 'notify',
  icon: 'volume-2',
  class: 'effect',
  description: 'Says a sentence aloud on a speaker, camera, computer, phone or in a room.',
  inputs: [
    {
      name: 'target',
      type: { t: 'ref', of: 'target' },
      required: true,
      description: 'Where to speak.',
      summary: true,
    },
    {
      name: 'text',
      type: { t: 'text' },
      required: true,
      live: true,
      description: 'What to say.',
      summary: true,
    },
    {
      name: 'priority',
      type: {
        t: 'choice',
        options: [
          { id: 'queue', label: 'Wait for the speaker to be free' },
          { id: 'interrupt', label: 'Interrupt what is playing' },
        ],
      },
      required: false,
      default: 'queue',
      static: true,
      description: 'Whether to wait or interrupt.',
    },
    {
      name: 'volume',
      type: { t: 'optional', of: { t: 'number', min: 0, max: 100, unit: '%' } },
      required: false,
      static: true,
      description: 'How loud to speak.',
    },
    {
      name: 'voice',
      type: { t: 'optional', of: { t: 'text' } },
      required: false,
      static: true,
      description: 'Which voice to use.',
    },
  ],
  outputs: [
    { name: 'ok', type: { t: 'boolean' }, description: 'Whether it was spoken.' },
    {
      name: 'spokenOn',
      type: { t: 'list', of: { t: 'text' } },
      description: 'The names of the places that spoke.',
    },
  ],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects_person' },
  summary: 'Say {text} on {target}',
  keywords: ['say', 'tts', 'announce', 'voice', 'speaker'],
  access: 'member',
  tier: 'v1',
});

const NOTIFY_ASK = defineNodeKind({
  id: 'notify.ask',
  name: 'Ask and wait',
  category: 'notify',
  icon: 'message-circle-question',
  class: 'control',
  description:
    'Asks a person a question with two to four answer buttons and waits for the answer. The run is kept while it waits.',
  inputs: [
    {
      name: 'person',
      type: { t: 'ref', of: 'person' },
      required: true,
      description: 'Who to ask.',
      summary: true,
    },
    {
      name: 'question',
      type: { t: 'text' },
      required: true,
      live: true,
      description: 'The question.',
      summary: true,
    },
    {
      name: 'options',
      type: { t: 'list', of: { t: 'text' } },
      required: true,
      static: true,
      description: 'The answer buttons, two to four.',
    },
    {
      name: 'timeout',
      type: { t: 'optional', of: { t: 'duration' } },
      required: false,
      static: true,
      description: 'How long to wait before the timed out exit.',
      ui: { editor: 'duration' },
    },
    {
      name: 'defaultAnswer',
      type: { t: 'optional', of: { t: 'text' } },
      required: false,
      static: true,
      description:
        'The answer to use when time runs out. Without one the answer is missing and the timed out exit runs.',
    },
  ],
  outputs: [
    {
      name: 'answer',
      type: { t: 'text' },
      optional: true,
      description:
        'The button that was pressed, or the answer to use when time ran out. Missing when time ran out without one.',
    },
    {
      name: 'by',
      type: { t: 'optional', of: { t: 'ref', of: 'person' } },
      optional: true,
      description: 'Who answered.',
    },
    {
      name: 'timedOut',
      type: { t: 'boolean' },
      description: 'Whether time ran out before anyone answered.',
    },
  ],
  exits: ['next', 'timedOut'],
  scopes: { required: [], optional: ['timedOut'] },
  summary: 'Ask {person} {question}',
  keywords: ['ask', 'question', 'confirm', 'yes', 'no', 'button', 'approve'],
  access: 'member',
  tier: 'v1',
});

export const NOTIFY_KINDS: readonly NodeKind[] = [
  NOTIFY_PERSON,
  NOTIFY_FEED,
  NOTIFY_SPEAK,
  NOTIFY_ASK,
];
