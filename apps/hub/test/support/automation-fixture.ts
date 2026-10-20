import { randomUUID } from 'node:crypto';
import type {
  AutomationAuthor,
  AutomationRowV3,
  AutomationRunRecord,
  AutomationV3,
  FlowNode,
  JsonValue,
  PluginOrigin,
  PortValue,
  TriggerNode,
} from '@smarteverything/domain';
import type { Store } from '../../src/store/store';
import { TEST_AUTHOR } from './automation-author';

let counter = 0;

function nextCount(): number {
  counter += 1;
  return counter;
}

function keyOf(kind: string): string {
  return `${kind.split('.').at(-1) ?? kind}${String(nextCount())}`;
}

export const PLACEHOLDER_HASH = 'a'.repeat(64);

export const EMPTY_LAYOUT = { nodes: {}, frames: [], comments: [] };

function literals(ports: Readonly<Record<string, JsonValue>>): Record<string, PortValue> {
  return Object.fromEntries(Object.entries(ports).map(([name, lit]) => [name, { lit }]));
}

export function trigger(
  kind: string,
  ports: Readonly<Record<string, JsonValue>> = {},
): TriggerNode {
  return { id: randomUUID(), key: keyOf(kind), kind, ports: literals(ports) };
}

export function node(kind: string, ports: Readonly<Record<string, JsonValue>> = {}): FlowNode {
  return { id: randomUUID(), key: keyOf(kind), kind, ports: literals(ports) };
}

export function programOf(
  triggers: readonly TriggerNode[] = [],
  body: readonly FlowNode[] = [],
): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [...triggers],
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes: [...body] },
    policy: { mode: 'single' },
  };
}

export interface AutomationFixture {
  readonly name?: string;
  readonly enabled?: boolean;
  readonly triggers?: readonly TriggerNode[];
  readonly body?: readonly FlowNode[];
  readonly origin?: PluginOrigin | null;
  readonly author?: AutomationAuthor | null;
}

export function saveAutomation(
  store: Pick<Store, 'automations'>,
  fixture: AutomationFixture = {},
): AutomationRowV3 {
  return store.automations.create({
    name: fixture.name ?? `Test automation ${String(nextCount())}`,
    enabled: fixture.enabled ?? true,
    program: programOf(fixture.triggers, fixture.body),
    layout: EMPTY_LAYOUT,
    planHash: PLACEHOLDER_HASH,
    origin: fixture.origin ?? null,
    author: fixture.author === undefined ? TEST_AUTHOR : fixture.author,
  });
}

export function startRun(
  store: Pick<Store, 'automationRunRecords'>,
  automationId: string,
  status: AutomationRunRecord['status'] = 'queued',
): AutomationRunRecord {
  const run = store.automationRunRecords.create({
    automationId,
    revision: 1,
    ownerProfileId: null,
    mode: 'live',
    planHash: PLACEHOLDER_HASH,
  });
  return status === 'queued' ? run : store.automationRunRecords.update(run.id, { status });
}
