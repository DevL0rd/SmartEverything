import {
  NODE_REGISTRY,
  type NodeKindLookup,
  type NodeKind,
  type InputPortDecl,
} from '@smarteverything/domain';

export const PLUGIN_STEP = 'plugin.demo.ping';

export const PLUGIN_BRANCHING = 'plugin.demo.watch';

export const PLUGIN_VALUE = 'plugin.demo.reading';

function base(id: string): NodeKind {
  const found = NODE_REGISTRY.get(id);
  if (found === undefined) throw new Error(`${id} is not a core kind`);
  return found;
}

function inputOf(name: string, fallback: number): InputPortDecl {
  const [first] = base('device.set').inputs;
  if (first === undefined) throw new Error('device.set has no inputs');
  return { ...first, name, required: false, default: fallback };
}

const step: NodeKind = {
  ...base('device.set'),
  id: PLUGIN_STEP,
  name: 'Ping the demo',
  inputs: [inputOf('level', 7)],
};

const branching: NodeKind = {
  ...base('device.set'),
  id: PLUGIN_BRANCHING,
  name: 'Watch the demo',
  exits: ['next', 'changed'],
};

const reading: NodeKind = {
  ...base('device.get'),
  id: PLUGIN_VALUE,
  name: 'Demo reading',
  inputs: [inputOf('level', 7)],
};

const KINDS: ReadonlyMap<string, NodeKind> = new Map([
  [step.id, step],
  [branching.id, branching],
  [reading.id, reading],
]);

export const PLUGIN_LOOKUP: NodeKindLookup = {
  get: (id) => KINDS.get(id) ?? NODE_REGISTRY.get(id),
  has: (id) => KINDS.has(id) || NODE_REGISTRY.has(id),
};
