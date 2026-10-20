import type { FlowType } from '../automation-v3/types';
import type { NodeKind } from './define';
import { defineNodeKind } from './define';

const ANY: FlowType = { t: 'any' };
const FLAG: FlowType = { t: 'boolean' };

interface Option {
  readonly id: string;
  readonly label: string;
}

const TARGETS: Option[] = [
  { id: 'number', label: 'Number' },
  { id: 'text', label: 'Text' },
  { id: 'boolean', label: 'On/off' },
  { id: 'duration', label: 'Duration' },
  { id: 'instant', label: 'Moment' },
  { id: 'list', label: 'List' },
];

export const UTIL_KINDS: readonly NodeKind[] = [
  defineNodeKind({
    id: 'util.convert',
    name: 'Convert',
    category: 'utilities',
    icon: 'arrow-right-left',
    class: 'pure',
    description:
      'Converts a value to another type. A value that cannot be converted fails loudly with the text it saw, unless a default is set.',
    inputs: [
      { name: 'value', type: ANY, required: true, description: 'The value to convert.' },
      {
        name: 'to',
        type: { t: 'choice', options: TARGETS },
        required: true,
        static: true,
        summary: true,
        description: 'The type to convert to.',
      },
      {
        name: 'default',
        type: { t: 'optional', of: ANY },
        required: false,
        description: 'Used instead of failing when the conversion does not work.',
      },
    ],
    outputs: [
      { name: 'result', type: ANY, description: 'The converted value.' },
      { name: 'ok', type: FLAG, description: 'Whether the conversion worked.' },
    ],
    exits: [],
    summary: 'Convert {value} to {to}',
    keywords: ['convert', 'cast', 'number', 'text', 'parse', 'type'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'util.lookup',
    name: 'Lookup table',
    category: 'utilities',
    icon: 'table-2',
    class: 'pure',
    description:
      'Maps a key to a value using a table of rows, with a fallback when no row matches.',
    inputs: [
      { name: 'key', type: ANY, required: true, description: 'The key to look up.' },
      {
        name: 'rows',
        type: {
          t: 'list',
          of: { t: 'record', fields: { key: ANY, value: ANY } },
        },
        required: true,
        static: true,
        summary: true,
        description: 'The table: each row has a key and a value.',
      },
      {
        name: 'default',
        type: { t: 'optional', of: ANY },
        required: false,
        description: 'The value when no row matches.',
      },
    ],
    outputs: [
      { name: 'value', type: ANY, description: 'The matching value.' },
      { name: 'found', type: FLAG, description: 'Whether a row matched.' },
    ],
    exits: [],
    summary: 'Look up {key} in {rows}',
    keywords: ['lookup', 'table', 'map', 'translate', 'switch'],
    access: 'member',
    tier: 'v1',
  }),
];
