import type { FlowType } from '../automation-v3/types';
import type { InputPortDecl, NodeKind, OutputPortDecl } from './define';
import { defineNodeKind } from './define';

const TEXT: FlowType = { t: 'text' };
const FLAG: FlowType = { t: 'boolean' };
const TEXTS: FlowType = { t: 'list', of: TEXT };

function choice(options: readonly (readonly [string, string])[]): FlowType {
  return {
    t: 'choice',
    options: options.map(([id, label]) => ({ id, label })),
  };
}

function option(
  name: string,
  type: FlowType,
  description: string,
  extra: Partial<InputPortDecl> = {},
): InputPortDecl {
  return { name, type, required: false, static: true, description, ...extra };
}

function input(name: string, type: FlowType, description: string): InputPortDecl {
  return { name, type, required: true, description };
}

function output(name: string, type: FlowType, description: string): OutputPortDecl {
  return { name, type, description };
}

function pure(
  fields: Pick<
    NodeKind,
    'id' | 'name' | 'icon' | 'description' | 'summary' | 'keywords' | 'inputs' | 'outputs'
  >,
): NodeKind {
  return defineNodeKind({
    ...fields,
    category: 'text',
    class: 'pure',
    exits: [],
    access: 'member',
    tier: 'v1',
  });
}

const PATTERN_NOTE = 'A pattern is a regex such as ^door|window$.';

const SLOT: FlowType = { t: 'optional', of: { t: 'any' } };

function slot(name: string): InputPortDecl {
  return {
    name,
    type: SLOT,
    required: false,
    description: `The value written where the template says {${name}}.`,
  };
}

const format = pure({
  id: 'text.format',
  name: 'Message',
  icon: 'text-quote',
  description:
    'Builds text from a fixed template and up to four wired values: {a}, {b}, {c} and {d} in the template are replaced by the values wired into a, b, c and d. Nothing else in the template is calculated.',
  inputs: [
    option('template', TEXT, 'The text with {a} to {d} slots, such as "{a} windows are open".', {
      required: true,
      summary: true,
    }),
    slot('a'),
    slot('b'),
    slot('c'),
    slot('d'),
    option(
      'places',
      { t: 'number', integer: true, min: 0, max: 10 },
      'Decimal places for numbers.',
    ),
    option('grouping', FLAG, 'Group thousands in numbers.', { default: false }),
  ],
  outputs: [output('text', TEXT, 'The finished text.')],
  summary: '{template}',
  keywords: ['message', 'template', 'compose', 'sentence', 'format', 'speech', 'text'],
});

const join = pure({
  id: 'text.join',
  name: 'Join',
  icon: 'link',
  description:
    'Joins a list of text into one, with a different separator before the last item if wanted.',
  inputs: [
    input('items', TEXTS, 'The text items.'),
    option('separator', TEXT, 'Placed between items.', { default: ', ' }),
    option('lastSeparator', TEXT, 'Placed before the last item, such as " and ".'),
  ],
  outputs: [output('text', TEXT, 'The joined text.')],
  summary: 'Join {items}',
  keywords: ['concatenate', 'combine', 'list', 'speech', 'and'],
});

const split = pure({
  id: 'text.split',
  name: 'Split',
  icon: 'scissors',
  description: `Cuts text into a list at a separator or pattern. ${PATTERN_NOTE}`,
  inputs: [
    input('text', TEXT, 'The text to cut.'),
    option('separator', TEXT, 'Where to cut.', { required: true, summary: true }),
    option('isPattern', FLAG, 'Treat the separator as a pattern.', { default: false }),
    option('limit', { t: 'number', integer: true, min: 1 }, 'The most parts to return.'),
    option('trim', FLAG, 'Trim each part.', { default: false }),
    option('dropEmpty', FLAG, 'Leave out empty parts.', { default: false }),
  ],
  outputs: [output('parts', TEXTS, 'The parts.')],
  summary: 'Split {text} at {separator}',
  keywords: ['cut', 'separate', 'tokenize', 'explode', 'csv'],
});

const replace = pure({
  id: 'text.replace',
  name: 'Replace',
  icon: 'replace',
  description: `Replaces text or a pattern. ${PATTERN_NOTE}`,
  inputs: [
    input('text', TEXT, 'The text to change.'),
    option('find', TEXT, 'What to find.', { required: true, summary: true }),
    option('replacement', TEXT, 'What to put instead.', { default: '', summary: true }),
    option('isPattern', FLAG, 'Treat find as a pattern.', { default: false }),
    option('all', FLAG, 'Replace every match, not only the first.', { default: true }),
  ],
  outputs: [output('text', TEXT, 'The changed text.')],
  summary: 'Replace {find} with {replacement} in {text}',
  keywords: ['substitute', 'swap', 'regex', 'pattern', 'strip'],
});

const regex = pure({
  id: 'text.regex',
  name: 'Find pattern',
  icon: 'regex',
  description: `Searches text for a pattern. An invalid pattern fails with Invalid. ${PATTERN_NOTE}`,
  inputs: [
    input('text', TEXT, 'The text to search.'),
    option('pattern', TEXT, 'The pattern.', { required: true, summary: true }),
    option('ignoreCase', FLAG, 'Ignore upper and lower case.', { default: false }),
    option('multiline', FLAG, 'Let ^ and $ match at every line.', { default: false }),
  ],
  outputs: [
    output('matched', FLAG, 'Whether the pattern was found.'),
    {
      name: 'match',
      type: TEXT,
      optional: true,
      description: 'The first match. Absent when not found.',
    },
    output('groups', { t: 'record', values: TEXT }, 'The captured groups of the first match.'),
    output('all', TEXTS, 'Every match.'),
  ],
  summary: 'Find {pattern} in {text}',
  keywords: ['regex', 'regular expression', 'match', 'extract', 'capture', 'search'],
});

const test = pure({
  id: 'text.test',
  name: 'Text check',
  icon: 'text-search',
  description:
    'Tests whether text contains, starts with, ends with or equals other text, or is empty.',
  inputs: [
    input('text', TEXT, 'The text to test.'),
    option(
      'test',
      choice([
        ['contains', 'contains'],
        ['starts_with', 'starts with'],
        ['ends_with', 'ends with'],
        ['equals', 'equals'],
        ['is_empty', 'is empty'],
      ]),
      'What to test.',
      { default: 'contains', summary: true },
    ),
    {
      name: 'other',
      type: TEXT,
      required: false,
      description: 'The text to look for. Not used for the empty test.',
      summary: true,
    },
    option('ignoreCase', FLAG, 'Ignore upper and lower case.', { default: false }),
  ],
  outputs: [output('result', FLAG, 'Whether the test holds.')],
  summary: '{text} {test} {other}',
  keywords: ['contains', 'starts', 'ends', 'equals', 'empty', 'includes', 'title'],
});

export const TEXT_KINDS: readonly NodeKind[] = [format, join, split, replace, regex, test];
