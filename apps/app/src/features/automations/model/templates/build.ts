import type {
  AutomationV3,
  CatchRow,
  FlowNode,
  JsonValue,
  PortValue,
  TriggerNode,
  Variable,
} from '@smarteverything/domain';

export const lit = (value: JsonValue): PortValue => ({ lit: value });

export { wire } from '@smarteverything/domain';

const SEEDS = [0x811c9dc5, 0x01000193, 0x9e3779b1, 0x85ebca6b] as const;
const FNV_PRIME = 0x01000193;
const HEX_WIDTH = 8;

function fnv(text: string, seed: number): number {
  let hash = seed;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME) >>> 0;
  }
  return hash;
}

function hex(value: number): string {
  return value.toString(16).padStart(HEX_WIDTH, '0');
}

export function uuidOf(seed: string): string {
  const [first = 0, second = 0, third = 0, fourth = 0] = SEEDS.map((start) => fnv(seed, start));
  const [a, b, c, d] = [hex(first), hex(second), hex(third), hex(fourth)];
  return `${a}-${b.slice(0, 4)}-4${b.slice(4, 7)}-8${c.slice(0, 3)}-${c.slice(3, 7)}${d}`;
}

export type Ports = Readonly<Record<string, PortValue>>;

export interface Maker {
  readonly node: (key: string, kind: string, ports?: Ports, extra?: Partial<FlowNode>) => FlowNode;
  readonly trigger: (key: string, kind: string, ports?: Ports) => TriggerNode;
  readonly when: (
    key: string,
    condition: PortValue,
    then: FlowNode[],
    otherwise?: FlowNode[],
  ) => FlowNode;
  readonly attempt: (
    key: string,
    body: FlowNode[],
    classes: NonNullable<CatchRow['classes']>,
    recovery: FlowNode[],
  ) => FlowNode;
}

export function maker(seed: string): Maker {
  let counter = 0;
  const id = (): string => {
    counter += 1;
    return uuidOf(`${seed}/${String(counter)}`);
  };
  const node: Maker['node'] = (key, kind, ports, extra = {}) => ({
    id: id(),
    key,
    kind,
    ...(ports === undefined ? {} : { ports: { ...ports } }),
    ...extra,
  });
  const trigger: Maker['trigger'] = (key, kind, ports) => ({
    id: id(),
    key,
    kind,
    ports: { ...ports },
  });
  const when: Maker['when'] = (key, condition, then, otherwise) =>
    node(key, 'flow.if', undefined, {
      branches: [{ id: id(), when: condition, scope: { nodes: then } }],
      ...(otherwise === undefined ? {} : { scopes: { else: { nodes: otherwise } } }),
    });
  const attempt: Maker['attempt'] = (key, body, classes, recovery) =>
    node(key, 'flow.try', undefined, {
      scopes: { try: { nodes: body } },
      catches: [{ id: id(), classes: [...classes], scope: { nodes: recovery } }],
    });
  return { node, trigger, when, attempt };
}

export interface Parts {
  readonly description?: string;
  readonly triggers: readonly TriggerNode[];
  readonly admit?: PortValue;
  readonly variables?: readonly Variable[];
  readonly mode?: 'single' | 'restart';
  readonly body: readonly FlowNode[];
}

export function automation(parts: Parts): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    ...(parts.description === undefined ? {} : { description: parts.description }),
    triggers: [...parts.triggers],
    ...(parts.admit === undefined ? {} : { admit: parts.admit }),
    inputs: [],
    outputs: [],
    variables: [...(parts.variables ?? [])],
    body: { nodes: [...parts.body] },
    policy: { mode: parts.mode ?? 'single' },
  };
}

export const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

export const SECOND_MS = 1000;
export const MINUTE_MS = 60_000;
