import type { FlowType } from '../automation-v3/types';
import type { NodeKind } from './define';
import { defineNodeKind } from './define';
import { ANY, FLAG, TEXT, choice, input, option, output } from './more-support';

const RECORD: FlowType = { t: 'record', values: { t: 'any' } };
const KEYWORDS = ['object', 'record', 'json', 'field'];
const ENTRY: FlowType = { t: 'record', fields: { key: TEXT, value: ANY } };

const PICK_MODES = [
  ['keep', 'Keep only these fields'],
  ['drop', 'Drop these fields'],
] as const;

export const OBJECT_MORE_KINDS: readonly NodeKind[] = [
  defineNodeKind({
    id: 'object.remove',
    name: 'Remove field',
    category: 'objects',
    icon: 'eraser',
    class: 'pure',
    description:
      'Returns a copy of the record without one field, found by path (dotted names and [0] indexes). A missing path fails with NotFound unless missing paths are ignored.',
    inputs: [
      input('source', RECORD, 'The record to change.'),
      input('path', TEXT, 'The path of the field to remove.', { static: true, summary: true }),
      option('ignoreMissing', FLAG, 'Leave the record unchanged when the path does not exist.', {
        default: false,
      }),
    ],
    outputs: [output('record', RECORD, 'The new record; the input is unchanged.')],
    exits: [],
    summary: 'Remove {path} from {source}',
    keywords: [...KEYWORDS, 'remove', 'delete', 'erase', 'drop'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'object.merge',
    name: 'Merge',
    category: 'objects',
    icon: 'merge',
    class: 'pure',
    description:
      'Combines records into one. A later record wins where fields clash. Deep merging combines records inside records; shallow merging replaces them whole.',
    inputs: [
      input('records', { t: 'list', of: RECORD }, 'The records to merge, in order.'),
      option('deep', FLAG, 'Merge records inside records instead of replacing them.', {
        default: false,
        summary: true,
      }),
    ],
    outputs: [output('record', RECORD, 'The merged record.')],
    exits: [],
    summary: 'Merge {records}',
    keywords: [...KEYWORDS, 'merge', 'combine', 'assign', 'overlay'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'object.fields',
    name: 'Fields',
    category: 'objects',
    icon: 'list-tree',
    class: 'pure',
    description:
      'Takes a record apart into its keys, values and key and value entries, or builds a record from a list of entries. Give either a record or entries.',
    inputs: [
      { ...input('source', RECORD, 'The record to take apart.'), required: false },
      {
        ...input(
          'entries',
          { t: 'list', of: ENTRY },
          'Entries with a key and a value to build a record from.',
        ),
        required: false,
      },
    ],
    outputs: [
      output('keys', { t: 'list', of: TEXT }, 'The field names.', true),
      output('values', { t: 'list', of: ANY }, 'The field values, in the same order.', true),
      output('entries', { t: 'list', of: ENTRY }, 'Each field as a key and a value.', true),
      output('record', RECORD, 'The record built from the entries.', true),
    ],
    exits: [],
    summary: 'Fields of {source}',
    keywords: [...KEYWORDS, 'keys', 'values', 'entries', 'from entries', 'object.keys'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'object.pick',
    name: 'Pick or omit',
    category: 'objects',
    icon: 'square-dashed-mouse-pointer',
    class: 'pure',
    description:
      'Returns a copy of the record with only the listed fields, or without them. Fields that are listed but missing are ignored.',
    inputs: [
      input('source', RECORD, 'The record to cut down.'),
      input('keys', { t: 'list', of: TEXT }, 'The field names.', { static: true, summary: true }),
      option('mode', choice(PICK_MODES), 'Keep the listed fields or drop them.', {
        default: 'keep',
      }),
    ],
    outputs: [output('record', RECORD, 'The new record; the input is unchanged.')],
    exits: [],
    summary: '{mode} {keys} of {source}',
    keywords: [...KEYWORDS, 'pick', 'omit', 'select', 'filter', 'keep', 'drop'],
    access: 'member',
    tier: 'v1.1',
  }),
];
