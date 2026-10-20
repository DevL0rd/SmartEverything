import type { FlowType } from '../automation-v3/types';
import type { NodeKind } from './define';
import { defineNodeKind } from './define';

const RECORD: FlowType = { t: 'record', values: { t: 'any' } };
const ANY: FlowType = { t: 'any' };
const FLAG: FlowType = { t: 'boolean' };
const TEXT: FlowType = { t: 'text' };
const VALUE: FlowType = { t: 'param', name: 'T' };

const KEYWORDS = ['object', 'record', 'json', 'field'];

export const OBJECT_KINDS: readonly NodeKind[] = [
  defineNodeKind({
    id: 'object.make',
    name: 'Record',
    category: 'objects',
    icon: 'braces',
    class: 'pure',
    description:
      'Builds a record from named fields. The field names and types you choose become the shape other nodes can pick from.',
    inputs: [
      {
        name: 'fields',
        type: RECORD,
        required: true,
        description: 'The named fields and their values.',
      },
    ],
    outputs: [{ name: 'record', type: RECORD, description: 'The record.' }],
    exits: [],
    summary: 'Record of {fields}',
    keywords: [...KEYWORDS, 'make', 'build', 'create'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'object.get',
    name: 'Get field',
    category: 'objects',
    icon: 'key-round',
    class: 'pure',
    description:
      'Reads one field by path (dotted names and [0] indexes). A missing path fails with NotFound unless a default is set; a value of the wrong type fails with TypeError.',
    inputs: [
      { name: 'source', type: RECORD, required: true, description: 'The record or JSON to read.' },
      {
        name: 'path',
        type: TEXT,
        required: true,
        static: true,
        summary: true,
        description: 'The path, for example detection.label or items[0].',
      },
      {
        name: 'default',
        type: { t: 'optional', of: VALUE },
        required: false,
        description: 'Returned instead of failing when the path is missing.',
      },
    ],
    outputs: [{ name: 'value', type: VALUE, description: 'The field value.' }],
    exits: [],
    summary: 'Field {path} of {source}',
    keywords: [...KEYWORDS, 'get', 'path', 'read', 'property'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'object.set',
    name: 'Set field',
    category: 'objects',
    icon: 'pencil',
    class: 'pure',
    description:
      'Returns a copy of a record with one field set. The input is unchanged. The keys __proto__ and constructor are rejected.',
    inputs: [
      { name: 'source', type: RECORD, required: true, description: 'The record to copy.' },
      {
        name: 'path',
        type: TEXT,
        required: true,
        static: true,
        summary: true,
        description: 'The path of the field to set.',
      },
      { name: 'value', type: ANY, required: true, description: 'The new value.' },
      {
        name: 'create',
        type: FLAG,
        required: false,
        default: true,
        static: true,
        description: 'Create the missing parts of the path.',
      },
    ],
    outputs: [{ name: 'record', type: RECORD, description: 'The updated copy.' }],
    exits: [],
    summary: 'Set {path} of {source} to {value}',
    keywords: [...KEYWORDS, 'set', 'write', 'update', 'property'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'object.parse_json',
    name: 'Read JSON',
    category: 'objects',
    icon: 'file-json',
    class: 'pure',
    description:
      'Turns JSON text into data. Invalid JSON fails with Invalid, or gives ok = false when the node continues on error.',
    inputs: [
      { name: 'text', type: TEXT, required: true, description: 'The JSON text.' },
      {
        name: 'shape',
        type: { t: 'optional', of: TEXT },
        required: false,
        static: true,
        description: 'The shape to narrow the result to, as a field list.',
      },
    ],
    outputs: [
      { name: 'json', type: ANY, description: 'The parsed data.' },
      { name: 'ok', type: FLAG, description: 'Whether the text was valid JSON.' },
    ],
    exits: [],
    summary: 'Read JSON from {text}',
    keywords: [...KEYWORDS, 'parse', 'decode', 'http', 'body'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'object.to_json',
    name: 'Write JSON',
    category: 'objects',
    icon: 'file-code',
    class: 'pure',
    description: 'Turns any value into JSON text.',
    inputs: [
      { name: 'value', type: ANY, required: true, description: 'The value to write.' },
      {
        name: 'pretty',
        type: FLAG,
        required: false,
        default: false,
        static: true,
        description: 'Indent the text for reading.',
      },
    ],
    outputs: [{ name: 'text', type: TEXT, description: 'The JSON text.' }],
    exits: [],
    summary: 'Write {value} as JSON',
    keywords: [...KEYWORDS, 'stringify', 'encode', 'serialize'],
    access: 'member',
    tier: 'v1',
  }),
];
