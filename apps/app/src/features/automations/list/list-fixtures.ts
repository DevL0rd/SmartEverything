import {
  ALL_NODE_KINDS,
  AUTOMATION_RUN_ID,
  type AutomationRowV3,
  type AutomationRunSummary,
  type AutomationV3,
  type NodeKind,
} from '@smarteverything/domain';
import { lit, program, step, trigger } from '../model/consumers/consumer-fixtures';
import type { ListContext } from './list-entries';

export const KITCHEN_ROOM = '00000000-0000-4000-8000-0000000000a1';
export const NOW = Date.parse('2026-10-18T12:00:00.000Z');
export const TODAY = '2026-10-18';

export function idOf(index: number): string {
  return `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

export function rowOf(
  index: number,
  definition: AutomationV3,
  extra: Partial<AutomationRowV3> = {},
): AutomationRowV3 {
  return {
    id: idOf(index),
    name: `Rule ${String(index)}`,
    enabled: true,
    revision: 1,
    definition,
    draft: null,
    layout: { nodes: {}, frames: [], comments: [] },
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...extra,
  };
}

export const timed = (): AutomationV3 =>
  program([trigger(1, 'trigger.time', { at: lit('18:30') })], [step(1, 'notify.feed')]);
export const evented = (): AutomationV3 =>
  program([trigger(1, 'trigger.button', { device: lit(idOf(900)) })], [step(1, 'notify.feed')]);
export const called = (): AutomationV3 =>
  program([trigger(1, 'trigger.called', {})], [step(1, 'notify.feed')]);
export const roomy = (): AutomationV3 =>
  program(
    [trigger(1, 'trigger.button', { device: lit(idOf(900)) })],
    [step(1, 'device.set', { target: lit({ room: KITCHEN_ROOM }) })],
  );

export function runOf(
  index: number,
  automation: number,
  status: AutomationRunSummary['status'],
  createdAt: string,
): AutomationRunSummary {
  return {
    id: AUTOMATION_RUN_ID.parse(`20000000-0000-4000-8000-${String(index).padStart(12, '0')}`),
    automation_id: idOf(automation),
    revision: 1,
    owner_profile_id: null,
    control_key: null,
    parent_run_id: null,
    status,
    mode: 'live',
    plan_hash: 'a'.repeat(64),
    current_node: null,
    started_by: null,
    steps: 0,
    commands: 0,
    iterations: 0,
    active_paths: [],
    wake_at: null,
    error: null,
    created_at: createdAt,
    started_at: createdAt,
    finished_at: null,
  };
}

const KINDS = new Map(ALL_NODE_KINDS.map((kind) => [kind.id, kind]));
const kindOf = (id: string): NodeKind | undefined => KINDS.get(id);

export function contextFor(overrides: Partial<ListContext> = {}): ListContext {
  return {
    describe: { kinds: kindOf, names: () => undefined },
    references: { kinds: kindOf, functions: () => undefined },
    rooms: new Map([[KITCHEN_ROOM, 'Kitchen']]),
    updates: new Set(),
    ...overrides,
  };
}
