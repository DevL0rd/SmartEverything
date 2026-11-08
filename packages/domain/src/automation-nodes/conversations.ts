import type { FlowType } from '../automation-v3/types';
import { WAKE_SENSITIVITIES, type WakeSensitivity } from '../wake-sensitivity';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';
import { ERROR_OUT } from './error-port';

const TEXT: FlowType = { t: 'text' };
const BOOLEAN: FlowType = { t: 'boolean' };

const SENSITIVITY_LABELS: Readonly<Record<WakeSensitivity, string>> = {
  standard: 'Standard',
  high: 'High, for a quiet or distant microphone',
  highest: 'Highest, hears the faintest calls',
};

export const LISTENING_SENSITIVITY_CHOICES = WAKE_SENSITIVITIES.map((id) => ({
  id,
  label: SENSITIVITY_LABELS[id],
}));

export const TRANSCRIPT_LINE_TYPE: FlowType = {
  t: 'record',
  fields: {
    at: { t: 'instant' },
    speaker: TEXT,
    text: TEXT,
    bot: BOOLEAN,
  },
};

const PERSON_REF: FlowType = { t: 'ref', of: 'person' };

const chatPost = defineNodeKind({
  id: 'chat.post',
  name: 'Post to a chat',
  category: 'notify',
  icon: 'message-square',
  class: 'effect',
  description:
    'Posts a message, with a picture if you give one, into a person’s AI chat for results they should keep. The owner can post to anyone’s chat; everyone else only to their own. Sending continues as soon as the post is handed over; waiting continues once the message is in the chat and gives its id.',
  inputs: [
    {
      name: 'person',
      type: { t: 'optional', of: PERSON_REF },
      required: false,
      static: true,
      description: 'Whose chat. Your own when left empty.',
      summary: true,
      ui: { label: 'Chat of' },
    },
    {
      name: 'text',
      type: { t: 'optional', of: TEXT },
      required: false,
      live: true,
      description: 'The message. Needed unless a picture goes with it.',
      summary: true,
    },
    {
      name: 'picture',
      type: { t: 'optional', of: TEXT },
      required: false,
      live: true,
      description: 'A picture id from Camera picture or Make a picture to post with the message.',
    },
    {
      name: 'notify',
      type: BOOLEAN,
      required: false,
      default: true,
      static: true,
      description: 'Send a phone notification with the message.',
      ui: { label: 'Notify them' },
    },
  ],
  outputs: [
    {
      name: 'messageId',
      type: TEXT,
      optional: true,
      description: 'The id of the message. Only set when the step waited for the post.',
    },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects_person', mode: 'fire_and_forget' },
  summary: 'Post {text} to the chat of {person}',
  keywords: ['chat', 'post', 'message', 'assistant', 'result', 'picture', 'tell', 'person'],
  access: 'member',
  tier: 'v1.1',
});

const transcriptInputs: readonly InputPortDecl[] = [
  {
    name: 'source',
    type: TEXT,
    required: true,
    static: true,
    description: 'Where the speech was heard: a camera, a phone, a computer or a plugin.',
    summary: true,
    ui: { label: 'Heard by', optionsFrom: 'speech.sources' },
  },
  {
    name: 'last',
    type: { t: 'duration' },
    required: true,
    description: 'How far back to read, up to now.',
    summary: true,
    ui: { label: 'Last', editor: 'duration' },
  },
  {
    name: 'search',
    type: { t: 'optional', of: TEXT },
    required: false,
    live: true,
    description: 'Only lines with these words in them. Every line when left empty.',
    ui: { label: 'Search for' },
  },
];

const transcriptOutputs: readonly OutputPortDecl[] = [
  {
    name: 'text',
    type: TEXT,
    description: 'The lines as text, oldest first, one per row as speaker, colon and words.',
  },
  {
    name: 'lines',
    type: { t: 'list', of: TRANSCRIPT_LINE_TYPE },
    description: 'The lines, oldest first, with the time, the speaker and the words of each.',
  },
  {
    name: 'speakers',
    type: { t: 'list', of: PERSON_REF },
    description: 'The people of the home who spoke in these lines.',
  },
  ERROR_OUT,
];

const transcriptRead = defineNodeKind({
  id: 'transcript.read',
  name: 'Read what was heard',
  category: 'cameras',
  icon: 'scroll-text',
  class: 'effect',
  description:
    'Reads the speech one camera, phone, computer or plugin wrote down over the last stretch of time, or only the lines with some words in them. Members read only the speech of their own phone or computer. It continues once the lines are read.',
  inputs: transcriptInputs,
  outputs: transcriptOutputs,
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'effects' },
  summary: 'Read what {source} heard in the last {last}',
  keywords: ['transcript', 'speech', 'heard', 'said', 'words', 'listen', 'search', 'conversation'],
  access: 'member',
  tier: 'v1.1',
});

const OPTIONAL_SWITCH = (name: string, label: string, description: string): InputPortDecl => ({
  name,
  type: { t: 'optional', of: BOOLEAN },
  required: false,
  static: true,
  description,
  ui: { label },
});

const listeningSet = defineNodeKind({
  id: 'listening.set',
  name: 'Set listening',
  category: 'cameras',
  icon: 'audio-lines',
  class: 'effect',
  description:
    'Changes how one camera, phone, computer or channel listens: whether it hears the assistant’s name, whether it writes down what it hears, and how readily it hears the name. Whatever is left empty stays as it is. The owner changes any source; everyone else only their own phone or computer.',
  inputs: [
    {
      name: 'source',
      type: TEXT,
      required: true,
      static: true,
      description: 'Which camera, phone, computer or channel.',
      summary: true,
      ui: { label: 'Listener', optionsFrom: 'listening.sources' },
    },
    OPTIONAL_SWITCH(
      'wake',
      'Hears the name',
      'Listen for the assistant’s name. Left empty keeps it.',
    ),
    OPTIONAL_SWITCH(
      'transcribe',
      'Writes down speech',
      'Write down what it hears. Left empty keeps it.',
    ),
    {
      name: 'sensitivity',
      type: { t: 'optional', of: { t: 'choice', options: [...LISTENING_SENSITIVITY_CHOICES] } },
      required: false,
      static: true,
      description: 'How readily the name is heard. Left empty keeps it.',
      ui: { label: 'Sensitivity' },
    },
  ],
  outputs: [
    { name: 'ok', type: BOOLEAN, description: 'Whether the listening was changed.' },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Set listening of {source}',
  keywords: ['listening', 'wake', 'name', 'transcribe', 'microphone', 'ear', 'sensitivity'],
  access: 'member',
  tier: 'v1.1',
});

export const CONVERSATION_KINDS: readonly NodeKind[] = [chatPost, transcriptRead, listeningSet];
