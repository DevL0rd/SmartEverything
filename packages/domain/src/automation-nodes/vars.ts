import type { FlowType } from '../automation-v3/types';
import type { PortValue } from '../automation-v3/port-value';
import type { InputPortDecl, NodeKind } from './define';
import { defineNodeKind } from './define';

const VALUE: FlowType = { t: 'param', name: 'T' };

interface Option {
  readonly id: string;
  readonly label: string;
}

const SOURCES: Option[] = [
  { id: 'run', label: 'Run variable' },
  { id: 'automation', label: 'Automation variable' },
  { id: 'home', label: 'Home Value' },
];

const CHANGE_OPS: Option[] = [
  { id: 'toggle', label: 'Toggle' },
  { id: 'add', label: 'Add' },
  { id: 'subtract', label: 'Subtract' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'next', label: 'Next' },
  { id: 'previous', label: 'Previous' },
  { id: 'append', label: 'Append to list' },
  { id: 'remove', label: 'Remove from list' },
  { id: 'set_field', label: 'Set field' },
];

const EDGES: Option[] = [
  { id: 'wrap', label: 'Wrap around' },
  { id: 'clamp', label: 'Stop at the end' },
];

function literal(port: PortValue | undefined): unknown {
  return port !== undefined && 'lit' in port ? port.lit : undefined;
}

function variableKeys(ports: Readonly<Record<string, PortValue | undefined>>): readonly string[] {
  const source = literal(ports['source']);
  const name = literal(ports['name']);
  if (source === 'home') {
    const value = literal(ports['value']);
    return [`value:${typeof value === 'string' ? value : '*'}`];
  }
  return [
    `${source === 'automation' ? 'persistent' : 'run'}:${typeof name === 'string' ? name : '*'}`,
  ];
}

const TEXT: FlowType = { t: 'text' };

const SOURCE_INPUTS: readonly InputPortDecl[] = [
  {
    name: 'source',
    type: { t: 'choice', options: SOURCES },
    required: false,
    default: 'run',
    static: true,
    description:
      'Where the variable lives: this run, this automation across runs, or a home Value.',
  },
  {
    name: 'name',
    type: { t: 'optional', of: TEXT },
    required: false,
    static: true,
    summary: true,
    ui: { optionsFrom: 'variables' },
    description: 'The variable name for a run or automation variable.',
  },
  {
    name: 'value',
    type: { t: 'optional', of: { t: 'ref', of: 'value' } },
    required: false,
    static: true,
    description: 'The home Value when the source is a home Value.',
  },
];

const VAR_SECRET = defineNodeKind({
  id: 'var.secret',
  name: 'Secret',
  category: 'variables',
  icon: 'key-square',
  class: 'read',
  description:
    'Hands a stored secret to the nodes that accept one, such as the sign-in of a web request. The secret itself is never shown, recorded or readable as text.',
  inputs: [
    {
      name: 'secret',
      type: { t: 'ref', of: 'secret' },
      required: true,
      static: true,
      summary: true,
      description: 'The stored secret.',
    },
  ],
  outputs: [
    {
      name: 'secret',
      type: { t: 'ref', of: 'secret' },
      description: 'The secret, as a hidden handle.',
    },
  ],
  exits: [],
  summary: 'Secret {secret}',
  keywords: ['secret', 'token', 'key', 'password', 'api key'],
  access: 'owner',
  tier: 'v1.1',
});

export const VAR_KINDS: readonly NodeKind[] = [
  VAR_SECRET,
  defineNodeKind({
    id: 'var.get',
    name: 'Get variable',
    category: 'variables',
    icon: 'variable',
    class: 'read',
    description:
      'Reads a run variable, an automation variable kept across runs, or a home Value. A choice Value gives its id.',
    inputs: [
      ...SOURCE_INPUTS,
      {
        name: 'asLabel',
        type: { t: 'boolean' },
        required: false,
        default: false,
        static: true,
        description: 'For a choice Value, give its label instead of its id.',
      },
    ],
    outputs: [
      { name: 'value', type: VALUE, description: 'The current value.' },
      {
        name: 'revision',
        type: { t: 'number', integer: true },
        description: 'How many times it has changed.',
      },
    ],
    exits: [],
    summary: 'Get {name}',
    keywords: ['variable', 'value', 'get', 'read', 'state'],
    reads: variableKeys,
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'var.set',
    name: 'Set variable',
    category: 'variables',
    icon: 'square-pen',
    class: 'effect',
    description:
      'Sets a run variable, an automation variable or a home Value. The value must match the variable type, and a Value keeps its bounds and overflow rule.',
    inputs: [
      ...SOURCE_INPUTS,
      { name: 'to', type: VALUE, required: true, description: 'The new value.' },
    ],
    outputs: [{ name: 'value', type: VALUE, description: 'The value now stored.' }],
    exits: ['next'],
    effect: { retry: 'idempotent', budget: 'effects_if_durable' },
    summary: 'Set {name} to {to}',
    keywords: ['variable', 'value', 'set', 'write', 'store', 'state'],
    reads: variableKeys,
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'var.change',
    name: 'Change variable',
    category: 'variables',
    icon: 'chevrons-up-down',
    class: 'effect',
    description:
      'Changes a variable in one atomic step: toggle, add, subtract, multiply, step to the next or previous choice or list item (wrapping or stopping), or edit a list or record. A change a Value refuses fails with Invalid.',
    inputs: [
      ...SOURCE_INPUTS,
      {
        name: 'op',
        type: { t: 'choice', options: CHANGE_OPS },
        required: true,
        static: true,
        summary: true,
        description: 'What to do.',
      },
      {
        name: 'amount',
        type: { t: 'optional', of: VALUE },
        required: false,
        description: 'The amount, item or field value the operation needs.',
      },
      {
        name: 'field',
        type: { t: 'optional', of: TEXT },
        required: false,
        static: true,
        description: 'The field name for "set field".',
      },
      {
        name: 'edge',
        type: { t: 'choice', options: EDGES },
        required: false,
        default: 'wrap',
        static: true,
        description: 'For next and previous: wrap around or stop at the end.',
      },
      {
        name: 'steps',
        type: { t: 'optional', of: { t: 'list', of: VALUE } },
        required: false,
        static: true,
        description: 'The values to step through when the variable is not a choice.',
      },
    ],
    outputs: [
      { name: 'value', type: VALUE, description: 'The value after the change.' },
      { name: 'previous', type: VALUE, description: 'The value before the change.' },
      {
        name: 'wrapped',
        type: { t: 'boolean' },
        description: 'Whether next or previous wrapped around.',
      },
    ],
    exits: ['next'],
    effect: { retry: 'relative', budget: 'effects_if_durable' },
    summary: '{op} {name}',
    keywords: ['variable', 'value', 'change', 'increment', 'toggle', 'cycle', 'counter', 'next'],
    reads: variableKeys,
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'var.constant',
    name: 'Constant',
    category: 'variables',
    icon: 'pin',
    class: 'pure',
    description: 'A fixed value of any type, typed in once and used wherever it is wired.',
    inputs: [
      {
        name: 'value',
        type: VALUE,
        required: true,
        static: true,
        summary: true,
        description: 'The fixed value.',
      },
    ],
    outputs: [{ name: 'value', type: VALUE, description: 'The fixed value.' }],
    exits: [],
    summary: '{value}',
    keywords: ['constant', 'literal', 'fixed', 'value', 'number', 'text'],
    access: 'member',
    tier: 'v1',
  }),
];
