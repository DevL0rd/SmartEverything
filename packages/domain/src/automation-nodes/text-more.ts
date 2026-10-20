import type { NodeKind } from './define';
import { defineNodeKind } from './define';
import { ANY, INTEGER, TEXT, choice, input, option, output } from './more-support';

const CASE_MODES = [
  ['trim', 'Trim spaces'],
  ['lower', 'lower case'],
  ['upper', 'UPPER CASE'],
  ['title', 'Title Case'],
  ['sentence', 'Sentence case'],
  ['slug', 'slug-text'],
] as const;

const SPEAKABLE_KINDS = [
  ['number', 'A number'],
  ['duration', 'A duration'],
  ['moment', 'A moment'],
] as const;

export const TEXT_MORE_KINDS: readonly NodeKind[] = [
  defineNodeKind({
    id: 'text.case',
    name: 'Tidy text',
    category: 'text',
    icon: 'case-sensitive',
    class: 'pure',
    description:
      'Cleans up text: trims spaces, changes the case, or turns it into a slug of lower case words joined by dashes.',
    inputs: [
      input('text', TEXT, 'The text to change.'),
      option('mode', choice(CASE_MODES), 'What to do with it.', {
        default: 'trim',
        summary: true,
      }),
    ],
    outputs: [output('text', TEXT, 'The changed text.')],
    exits: [],
    summary: '{mode} for {text}',
    keywords: ['trim', 'lower', 'upper', 'title', 'sentence', 'slug', 'case', 'capitalise'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'text.slice',
    name: 'Part of text',
    category: 'text',
    icon: 'text-cursor',
    class: 'pure',
    description:
      'Takes part of a text, then optionally shortens it with an ellipsis and pads it to a length. Positions count characters from 0; a negative start counts from the end.',
    inputs: [
      input('text', TEXT, 'The text to cut.'),
      option('from', INTEGER, 'Where to start.', { default: 0 }),
      option(
        'count',
        { t: 'optional', of: INTEGER },
        'How many characters to take; the rest when empty.',
      ),
      option(
        'shortenTo',
        { t: 'optional', of: INTEGER },
        'Cut longer results to this many characters, ending in an ellipsis.',
      ),
      option(
        'padTo',
        { t: 'optional', of: INTEGER },
        'Pad shorter results to this many characters.',
      ),
      option('padWith', TEXT, 'The character to pad with.', { default: ' ' }),
      option(
        'padAt',
        choice([
          ['end', 'At the end'],
          ['start', 'At the start'],
        ]),
        'Which side to pad.',
        { default: 'end' },
      ),
    ],
    outputs: [
      output('text', TEXT, 'The resulting text.'),
      output('length', INTEGER, 'Its length in characters.'),
    ],
    exits: [],
    summary: 'Part of {text}',
    keywords: ['substring', 'slice', 'cut', 'truncate', 'ellipsis', 'pad', 'left', 'right'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'text.speakable',
    name: 'Say it naturally',
    category: 'text',
    icon: 'audio-lines',
    class: 'pure',
    description:
      'Writes a number, a duration or a moment the way it is said aloud: "twenty-three point five degrees", "1 hour and 5 minutes", "Sunday 18 October at 2:32 pm". Numbers and durations are English; the locale only changes moments.',
    inputs: [
      input('value', ANY, 'The number, duration (milliseconds) or moment.'),
      option('kind', choice(SPEAKABLE_KINDS), 'What the value is.', {
        default: 'number',
        summary: true,
      }),
      option(
        'unit',
        { t: 'optional', of: TEXT },
        'A unit spoken after a number, such as "degrees".',
      ),
      option('locale', { t: 'optional', of: TEXT }, 'The locale for moments; en-GB when empty.'),
    ],
    outputs: [output('text', TEXT, 'The spoken text.')],
    exits: [],
    summary: 'Say {value}',
    keywords: ['speak', 'say', 'voice', 'words', 'natural', 'hours', 'minutes', 'degrees'],
    access: 'member',
    tier: 'v1.1',
  }),
];
