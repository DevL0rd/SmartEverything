import type {
  AutomationV3,
  FlowNode,
  JsonValue,
  PortValue,
  TriggerNode,
} from '@smarteverything/domain';
import type { ConsumerRow } from './row';

export const KITCHEN = '00000000-0000-4000-8000-000000000129';
export const LIVING = '00000000-0000-4000-8000-000000000030';
export const DIFFUSER = '00000000-0000-4000-8000-0000000000d1';
export const OTHER_DEVICE = '00000000-0000-4000-8000-0000000000aa';
export const GROUP = '7e000000-0000-4000-8000-000000000001';
export const VALUE = '00000000-0000-4000-8000-000000000131';

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1000).padStart(12, '0')}`;
}

export function lit(value: JsonValue): PortValue {
  return { lit: value };
}

export function trigger(
  index: number,
  kind: string,
  ports: Record<string, PortValue>,
  extra: Partial<TriggerNode> = {},
): TriggerNode {
  return { id: uuid(index), key: `t${String(index)}`, kind, ports, ...extra };
}

export function step(
  index: number,
  kind: string,
  ports: Record<string, PortValue> = {},
  extra: Partial<FlowNode> = {},
): FlowNode {
  return { id: uuid(100 + index), key: `s${String(index)}`, kind, ports, ...extra };
}

export function program(
  triggers: readonly TriggerNode[],
  nodes: readonly FlowNode[],
  inputs: AutomationV3['inputs'] = [],
): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [...triggers],
    inputs,
    outputs: [],
    variables: [],
    body: { nodes: [...nodes] },
    policy: { mode: 'single' },
  };
}

export function row(
  id: string,
  name: string,
  definition: AutomationV3,
  enabled = true,
): ConsumerRow {
  return { id, name, enabled, definition };
}

export const buttonTrigger = (device: string, press?: string): TriggerNode =>
  trigger(1, 'trigger.button', {
    device: lit(device),
    ...(press === undefined ? {} : { press: lit(press) }),
  });

export const setPower = (index: number, device: string, on: boolean): FlowNode =>
  step(index, 'device.set', {
    target: lit({ device }),
    control: lit('power'),
    to: lit(on),
  });
