import type { JsonValue, SignalInput, TriggerNode } from '@smarteverything/domain';
import { createKindCatalog } from '../../../src/automations/plugin-kinds/catalog';
import {
  compileTriggers,
  type CompiledTriggers,
} from '../../../src/automations/triggers-v3/armers';

const CORE_KINDS = createKindCatalog();

export function compileCore(automationId: string, nodes: readonly TriggerNode[]): CompiledTriggers {
  return compileTriggers(automationId, nodes, CORE_KINDS.matcher);
}

let counter = 0;

export function node(
  kind: string,
  ports: Readonly<Record<string, JsonValue>>,
  extra: Partial<TriggerNode> = {},
): TriggerNode {
  counter += 1;
  return {
    id: `trigger-${String(counter)}`,
    key: `t${String(counter)}`,
    kind,
    ports: Object.fromEntries(Object.entries(ports).map(([name, lit]) => [name, { lit }])),
    ...extra,
  };
}

export function signal(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: 'lamp',
    field: 'power',
    value: true,
    previous: false,
    at: '2026-10-19T08:00:00.000Z',
    profileId: null,
    data: {},
    ...overrides,
  };
}
