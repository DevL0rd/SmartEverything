import type { AutomationV3, FlowNode, PortValue, TriggerNode } from '@smarteverything/domain';

let counter = 0;

export function uuid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
}

export function idSource(): () => string {
  let next = 0;
  return (): string => {
    next += 1;
    return `11111111-1111-4111-8111-${next.toString(16).padStart(12, '0')}`;
  };
}

export function step(
  key: string,
  ports?: Record<string, PortValue>,
  extra?: Partial<FlowNode>,
): FlowNode {
  return {
    id: uuid(),
    key,
    kind: 'device.set',
    ...(ports === undefined ? {} : { ports }),
    ...extra,
  };
}

export function repeat(key: string, body: FlowNode[]): FlowNode {
  return {
    id: uuid(),
    key,
    kind: 'flow.repeat',
    ports: { times: { lit: 2 } },
    scopes: { body: { nodes: body } },
  };
}

export function trigger(key: string, extra?: Partial<TriggerNode>): TriggerNode {
  return { id: uuid(), key, kind: 'trigger.signal', ports: {}, ...extra };
}

export function automation(body: FlowNode[], triggers: TriggerNode[] = []): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers,
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes: body },
    policy: { mode: 'single' },
  };
}
