import {
  AUTOMATION_ROW_V3,
  EMPTY_LAYOUT,
  type AutomationRowV3,
  type FlowNode,
  type JsonValue,
  type PortValue,
  type TriggerNode,
} from '@smarteverything/domain';

const STAMP = '2026-10-16T08:00:00.000Z';

export function nodeId(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1000).padStart(12, '0')}`;
}

export function rowId(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

function lit(value: JsonValue): PortValue {
  return { lit: value };
}

export function buttonTrigger(device: string, press?: string): TriggerNode {
  return {
    id: nodeId(1),
    key: 't1',
    kind: 'trigger.button',
    ports: { device: lit(device), ...(press === undefined ? {} : { press: lit(press) }) },
  };
}

export function timeTrigger(at: string): TriggerNode {
  return { id: nodeId(1), key: 't1', kind: 'trigger.time', ports: { at: lit(at) } };
}

export function setPower(device: string, on: boolean): FlowNode {
  return {
    id: nodeId(101),
    key: 's1',
    kind: 'device.set',
    ports: { target: lit({ device }), control: lit('power'), to: lit(on) },
  };
}

export function setGroupPower(group: string, on: boolean): FlowNode {
  return {
    id: nodeId(101),
    key: 's1',
    kind: 'device.set',
    ports: { target: lit({ group }), control: lit('power'), to: lit(on) },
  };
}

export interface StoredAutomation {
  readonly index: number;
  readonly name: string;
  readonly triggers: readonly TriggerNode[];
  readonly nodes: readonly FlowNode[];
  readonly enabled?: boolean;
}

export function storedAutomationRow(stored: StoredAutomation): AutomationRowV3 {
  return AUTOMATION_ROW_V3.parse({
    id: rowId(stored.index),
    name: stored.name,
    enabled: stored.enabled ?? true,
    revision: 1,
    definition: {
      version: 3,
      kind: 'automation',
      triggers: stored.triggers,
      inputs: [],
      outputs: [],
      variables: [],
      body: { nodes: stored.nodes },
      policy: { mode: 'single' },
    },
    draft: null,
    layout: EMPTY_LAYOUT,
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: STAMP,
    updated_at: STAMP,
  });
}
