import type {
  AutomationV3,
  FlowNode,
  FunctionV3,
  InputPort,
  OutputPort,
  PortValue,
  Scope,
} from '@smarteverything/domain';

let counter = 0;

export function uuid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
}

export function call(
  key: string,
  functionId: string,
  extra: Partial<FlowNode> & { pinPort?: number } = {},
): FlowNode {
  const { pinPort, ...rest } = extra;
  const ports: Record<string, PortValue> = { fn: { lit: functionId }, ...rest.ports };
  if (pinPort !== undefined) ports['pin'] = { lit: pinPort };
  return { id: uuid(), key, kind: 'fn.call', ...rest, ports };
}

export function node(key: string, kind: string, ports?: Record<string, PortValue>): FlowNode {
  return { id: uuid(), key, kind, ...(ports === undefined ? {} : { ports }) };
}

export function fn(
  body: FlowNode[],
  shape: {
    inputs?: readonly InputPort[];
    outputs?: readonly OutputPort[];
    exits?: readonly string[];
    flavour?: 'pure' | 'action' | undefined;
  } = {},
): FunctionV3 {
  return {
    version: 3,
    kind: 'function',
    flavour: shape.flavour ?? 'action',
    inputs: [...(shape.inputs ?? [])],
    outputs: [...(shape.outputs ?? [])],
    exits: [...(shape.exits ?? ['done'])],
    variables: [],
    body: { nodes: body },
  };
}

export function automation(body: FlowNode[], onFailure?: Scope): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes: body },
    ...(onFailure === undefined ? {} : { onFailure }),
    policy: { mode: 'single' },
  };
}

export const NUMBER = { t: 'number' } as const;
export const TEXT = { t: 'text' } as const;
