import type { FlowType } from '../automation-v3/types';
import type { NodeKind } from './define';
import { defineNodeKind } from './define';
import {
  ANY,
  FLAG,
  INTEGER,
  ITEMS,
  NUMBER,
  TEXT,
  choice,
  input,
  option,
  output,
} from './more-support';

export const LIST_RANGE_LIMIT = 100_000;

const KEYWORDS = ['list', 'array', 'items'];
const LISTS: FlowType = { t: 'list', of: ITEMS };

const COMBINE_MODES = [
  ['concat', 'Join one after the other'],
  ['union', 'Every item once'],
  ['intersect', 'Items in every list'],
  ['difference', 'Items of the first list only'],
] as const;

const RESHAPE_OPERATIONS = [
  ['reverse', 'Reverse'],
  ['flatten', 'Flatten one level'],
  ['chunk', 'Split into chunks'],
  ['zip', 'Pair with a second list'],
] as const;

const SLICE_MODES = [
  ['range', 'From a position'],
  ['first', 'The first items'],
  ['last', 'The last items'],
] as const;

export const LIST_MORE_KINDS: readonly NodeKind[] = [
  defineNodeKind({
    id: 'list.sort',
    name: 'Sort',
    category: 'lists',
    icon: 'arrow-up-down',
    class: 'pure',
    description:
      'Returns the list in order. Items are numbers or texts; for a list of records name the field to compare. Equal items keep their order. Mixed kinds fail with TypeError.',
    inputs: [
      input('list', ITEMS, 'The list to sort.'),
      option(
        'field',
        { t: 'optional', of: TEXT },
        'For a list of records: the field to compare, such as temperature.',
      ),
      option(
        'direction',
        choice([
          ['ascending', 'Lowest first'],
          ['descending', 'Highest first'],
        ]),
        'Which way to sort.',
        { default: 'ascending', summary: true },
      ),
      option(
        'natural',
        FLAG,
        'Order numbers inside text naturally, so "room 2" comes before "room 10".',
        {
          default: false,
        },
      ),
    ],
    outputs: [output('list', ITEMS, 'The sorted list; the input is unchanged.')],
    exits: [],
    summary: 'Sort {list}',
    keywords: [...KEYWORDS, 'sort', 'order', 'rank', 'highest', 'lowest'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'list.unique',
    name: 'Remove duplicates',
    category: 'lists',
    icon: 'copy-minus',
    class: 'pure',
    description:
      'Keeps the first of every group of equal items, in order. For a list of records name a field: items with the same value in it count as equal.',
    inputs: [
      input('list', ITEMS, 'The list to clean.'),
      option(
        'field',
        { t: 'optional', of: TEXT },
        'For a list of records: the field that makes items equal, such as room.',
      ),
    ],
    outputs: [
      output('list', ITEMS, 'The list without duplicates.'),
      output('removed', INTEGER, 'How many items were dropped.'),
    ],
    exits: [],
    summary: 'Remove duplicates from {list}',
    keywords: [...KEYWORDS, 'unique', 'distinct', 'duplicates', 'dedupe'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'list.slice',
    name: 'Take part',
    category: 'lists',
    icon: 'list-collapse',
    class: 'pure',
    description:
      'Takes part of a list: a run from a position, the first N items or the last N items. Asking for more than there is gives what there is.',
    inputs: [
      input('list', ITEMS, 'The list to cut.'),
      option('take', choice(SLICE_MODES), 'Which part to take.', { default: 'range' }),
      option('from', INTEGER, 'Where a run starts; a negative position counts from the end.', {
        default: 0,
      }),
      option(
        'count',
        { t: 'optional', of: INTEGER },
        'How many items; the rest of the list when empty for a run.',
        {
          summary: true,
        },
      ),
    ],
    outputs: [output('list', ITEMS, 'The part.')],
    exits: [],
    summary: 'Take part of {list}',
    keywords: [...KEYWORDS, 'slice', 'first', 'last', 'top', 'take', 'head', 'tail'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'list.combine',
    name: 'Combine lists',
    category: 'lists',
    icon: 'combine',
    class: 'pure',
    description:
      'Combines lists: join them end to end, keep every item once, keep the items found in every list, or keep the items of the first list that are in no other.',
    inputs: [
      input('lists', LISTS, 'The lists to combine, in order.'),
      option('mode', choice(COMBINE_MODES), 'How to combine them.', {
        default: 'concat',
        summary: true,
      }),
    ],
    outputs: [output('list', ITEMS, 'The combined list.')],
    exits: [],
    summary: 'Combine {lists}',
    keywords: [...KEYWORDS, 'concat', 'merge', 'union', 'intersect', 'difference'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'list.reshape',
    name: 'Reshape',
    category: 'lists',
    icon: 'layout-list',
    class: 'pure',
    description:
      'Rearranges a list: reverse it, flatten lists inside it by one level, split it into chunks of a size, or pair its items with those of a second list.',
    inputs: [
      input('list', ITEMS, 'The list to rearrange.'),
      option('op', choice(RESHAPE_OPERATIONS), 'How to rearrange it.', {
        default: 'reverse',
        summary: true,
      }),
      option('size', INTEGER, 'The chunk size when splitting into chunks.', { default: 2 }),
      option(
        'other',
        { t: 'optional', of: { t: 'list', of: ANY } },
        'The second list when pairing.',
      ),
    ],
    outputs: [output('list', { t: 'list', of: ANY }, 'The rearranged list.')],
    exits: [],
    summary: '{op} {list}',
    keywords: [...KEYWORDS, 'reverse', 'flatten', 'chunk', 'zip', 'pair', 'batch'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'list.range',
    name: 'Number range',
    category: 'lists',
    icon: 'list-ordered',
    class: 'pure',
    description: `A list of numbers from one to another, both included, in steps. Counts up or down to reach the end. More than ${String(LIST_RANGE_LIMIT)} numbers fails with LimitExceeded.`,
    inputs: [
      input('from', NUMBER, 'The first number.'),
      input('to', NUMBER, 'The last number.'),
      option('step', NUMBER, 'The size of each step; its sign is ignored.', { default: 1 }),
    ],
    outputs: [output('list', { t: 'list', of: NUMBER }, 'The numbers.')],
    exits: [],
    summary: 'Numbers from {from} to {to}',
    keywords: [...KEYWORDS, 'range', 'numbers', 'sequence', 'count'],
    access: 'member',
    tier: 'v1.1',
  }),
];
