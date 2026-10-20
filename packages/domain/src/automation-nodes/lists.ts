import type { FlowType } from '../automation-v3/types';
import type { InputPortDecl, NodeKind } from './define';
import { defineNodeKind } from './define';

const ITEM: FlowType = { t: 'param', name: 'T' };
const ITEMS: FlowType = { t: 'list', of: ITEM };
const INDEX: FlowType = { t: 'number', integer: true };
const FLAG: FlowType = { t: 'boolean' };

interface Option {
  readonly id: string;
  readonly label: string;
}

const TESTS: Option[] = [
  { id: 'eq', label: 'is equal to' },
  { id: 'ne', label: 'is not equal to' },
  { id: 'gt', label: 'is greater than' },
  { id: 'gte', label: 'is at least' },
  { id: 'lt', label: 'is less than' },
  { id: 'lte', label: 'is at most' },
];

const ITEM_TEST: readonly InputPortDecl[] = [
  {
    name: 'field',
    type: { t: 'optional', of: { t: 'text' } },
    required: false,
    static: true,
    description: 'For a list of records: the field of each item to test, such as online.',
  },
  {
    name: 'test',
    type: { t: 'choice', options: TESTS },
    required: false,
    default: 'eq',
    static: true,
    summary: true,
    description: 'How each item (or its field) is compared with the value.',
  },
  {
    name: 'value',
    type: { t: 'any' },
    required: false,
    default: true,
    summary: true,
    description: 'The value each item (or its field) is compared with.',
  },
];

function itemTest(
  id: string,
  name: string,
  icon: string,
  description: string,
  outputs: NodeKind['outputs'],
  words: readonly string[],
): NodeKind {
  return defineNodeKind({
    id,
    name,
    category: 'lists',
    icon,
    class: 'pure',
    description,
    inputs: [
      { name: 'list', type: ITEMS, required: true, description: 'The list to look at.' },
      ...ITEM_TEST,
    ],
    outputs,
    exits: [],
    summary: `${name} in {list} {test} {value}`,
    keywords: [...KEYWORDS, ...words],
    access: 'member',
    tier: 'v1',
  });
}

const KEYWORDS = ['list', 'array', 'items'];

const POSITIONS: Option[] = [
  { id: 'first', label: 'First' },
  { id: 'last', label: 'Last' },
  { id: 'index', label: 'By index' },
];

const ADD_POSITIONS: Option[] = [
  { id: 'end', label: 'At the end' },
  { id: 'start', label: 'At the start' },
  { id: 'index', label: 'At an index' },
];

const REMOVE_MODES: Option[] = [
  { id: 'index', label: 'By index' },
  { id: 'first', label: 'First matching value' },
  { id: 'all', label: 'Every matching value' },
];

const DIRECTIONS: Option[] = [
  { id: 'next', label: 'Next' },
  { id: 'previous', label: 'Previous' },
];

const EDGES: Option[] = [
  { id: 'wrap', label: 'Wrap around' },
  { id: 'stop', label: 'Stop at the end' },
];

export const LIST_KINDS: readonly NodeKind[] = [
  defineNodeKind({
    id: 'list.make',
    name: 'List',
    category: 'lists',
    icon: 'list',
    class: 'pure',
    description: 'Builds a list from the values you give it.',
    inputs: [{ name: 'items', type: ITEMS, required: true, description: 'The items, in order.' }],
    outputs: [{ name: 'list', type: ITEMS, description: 'The list.' }],
    exits: [],
    summary: 'List of {items}',
    keywords: [...KEYWORDS, 'make', 'build'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'list.get',
    name: 'Get item',
    category: 'lists',
    icon: 'list-start',
    class: 'pure',
    description:
      'Takes one item out of a list by position. A negative index counts from the end. An index outside the list fails with NotFound unless a default is set.',
    inputs: [
      { name: 'list', type: ITEMS, required: true, description: 'The list to read.' },
      {
        name: 'position',
        type: { t: 'choice', options: POSITIONS },
        required: false,
        default: 'index',
        static: true,
        description: 'First, last or by index.',
      },
      {
        name: 'index',
        type: INDEX,
        required: false,
        default: 0,
        description: 'The index when the position is "index"; negative counts from the end.',
      },
      {
        name: 'default',
        type: { t: 'optional', of: ITEM },
        required: false,
        description: 'Returned instead of failing when the index is out of range.',
      },
    ],
    outputs: [
      { name: 'item', type: ITEM, description: 'The item.' },
      { name: 'length', type: INDEX, description: 'How many items the list has.' },
    ],
    exits: [],
    summary: 'Item {index} of {list}',
    keywords: [...KEYWORDS, 'get', 'nth', 'first', 'last'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'list.length',
    name: 'Count items',
    category: 'lists',
    icon: 'hash',
    class: 'pure',
    description: 'Counts the items in a list.',
    inputs: [{ name: 'list', type: ITEMS, required: true, description: 'The list to count.' }],
    outputs: [{ name: 'length', type: INDEX, description: 'The number of items.' }],
    exits: [],
    summary: 'Count of {list}',
    keywords: [...KEYWORDS, 'count', 'size', 'length'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'list.add',
    name: 'Add item',
    category: 'lists',
    icon: 'list-plus',
    class: 'pure',
    description: 'Returns a new list with the item added at the end, the start or an index.',
    inputs: [
      { name: 'list', type: ITEMS, required: true, description: 'The list to extend.' },
      { name: 'item', type: ITEM, required: true, description: 'The item to add.' },
      {
        name: 'at',
        type: { t: 'choice', options: ADD_POSITIONS },
        required: false,
        default: 'end',
        static: true,
        description: 'Where to add it.',
      },
      {
        name: 'index',
        type: INDEX,
        required: false,
        default: 0,
        description: 'The index when adding at an index.',
      },
    ],
    outputs: [{ name: 'list', type: ITEMS, description: 'The new list; the input is unchanged.' }],
    exits: [],
    summary: 'Add {item} to {list}',
    keywords: [...KEYWORDS, 'add', 'append', 'push', 'insert'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'list.remove',
    name: 'Remove item',
    category: 'lists',
    icon: 'list-minus',
    class: 'pure',
    description: 'Returns a new list without one item, found by index or by value.',
    inputs: [
      { name: 'list', type: ITEMS, required: true, description: 'The list to shrink.' },
      {
        name: 'by',
        type: { t: 'choice', options: REMOVE_MODES },
        required: false,
        default: 'index',
        static: true,
        description: 'Remove by index, the first matching value or every matching value.',
      },
      {
        name: 'index',
        type: INDEX,
        required: false,
        default: 0,
        description: 'The index to remove when removing by index.',
      },
      {
        name: 'value',
        type: { t: 'optional', of: ITEM },
        required: false,
        description: 'The value to remove when removing by value.',
      },
    ],
    outputs: [{ name: 'list', type: ITEMS, description: 'The new list; the input is unchanged.' }],
    exits: [],
    summary: 'Remove from {list}',
    keywords: [...KEYWORDS, 'remove', 'delete', 'drop'],
    access: 'member',
    tier: 'v1',
  }),
  itemTest(
    'list.filter',
    'Keep where',
    'filter',
    'Splits a list in two: the items (or the field of each record) that pass the test against the value, and the rest.',
    [
      { name: 'kept', type: ITEMS, description: 'The items that passed.' },
      { name: 'rejected', type: ITEMS, description: 'The items that did not.' },
      { name: 'count', type: INDEX, description: 'How many items were kept.' },
    ],
    ['filter', 'where', 'select', 'keep'],
  ),
  itemTest(
    'list.find',
    'Find',
    'search',
    'Finds the first item (or record whose field) passes the test against the value.',
    [
      { name: 'found', type: FLAG, description: 'Whether an item passed.' },
      { name: 'item', type: { t: 'optional', of: ITEM }, optional: true, description: 'The item.' },
      {
        name: 'index',
        type: { t: 'optional', of: INDEX },
        optional: true,
        description: 'Where it was.',
      },
    ],
    ['find', 'search', 'first', 'contains'],
  ),
  itemTest(
    'list.any',
    'Any item',
    'list-checks',
    'True when at least one item (or the field of one record) passes the test against the value. False for an empty list.',
    [{ name: 'result', type: FLAG, description: 'Whether any item passed.' }],
    ['any', 'some', 'at least one', 'exists'],
  ),
  itemTest(
    'list.all',
    'Every item',
    'badge-check',
    'True when every item (or the field of every record) passes the test against the value. True for an empty list.',
    [{ name: 'result', type: FLAG, description: 'Whether every item passed.' }],
    ['all', 'every', 'each', 'none'],
  ),
  defineNodeKind({
    id: 'list.field',
    name: 'Field of each',
    category: 'lists',
    icon: 'wand',
    class: 'pure',
    description:
      'Builds a list of one field taken from every record in a list, in the same order. A record without the field fails with NotFound.',
    inputs: [
      { name: 'list', type: ITEMS, required: true, description: 'The list of records.' },
      {
        name: 'field',
        type: { t: 'text' },
        required: true,
        static: true,
        summary: true,
        description: 'The field to take, such as name.',
      },
    ],
    outputs: [
      {
        name: 'list',
        type: { t: 'list', of: { t: 'any' } },
        description: 'The field values, in the same order.',
      },
    ],
    exits: [],
    summary: '{field} of each in {list}',
    keywords: [...KEYWORDS, 'map', 'pluck', 'each', 'field', 'names'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'list.cycle',
    name: 'Next in list',
    category: 'lists',
    icon: 'rotate-cw',
    class: 'pure',
    description:
      'Gives the item after (or before) the current one. A current item that is not in the list gives the first item.',
    inputs: [
      { name: 'list', type: ITEMS, required: true, description: 'The list to step through.' },
      { name: 'current', type: ITEM, required: true, description: 'The item you are on now.' },
      {
        name: 'direction',
        type: { t: 'choice', options: DIRECTIONS },
        required: false,
        default: 'next',
        static: true,
        description: 'Step forward or backward.',
      },
      {
        name: 'edge',
        type: { t: 'choice', options: EDGES },
        required: false,
        default: 'wrap',
        static: true,
        description: 'Wrap around at the end, or stop on the last item.',
      },
    ],
    outputs: [
      { name: 'next', type: ITEM, description: 'The item to move to.' },
      { name: 'index', type: INDEX, description: 'Its position in the list.' },
    ],
    exits: [],
    summary: 'Step {direction} in {list} from {current}',
    keywords: [...KEYWORDS, 'cycle', 'next', 'previous', 'rotate', 'step'],
    access: 'member',
    tier: 'v1',
  }),
];
