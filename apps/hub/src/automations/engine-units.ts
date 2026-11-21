import { ApiError, type FlowType, type JsonValue } from '@smarteverything/domain';
import type { AiChatRow, AutomationRunRecord, StoredAutomationRow } from '@smarteverything/domain';
import type { NewChat } from '../store/repositories/ai-chat-input';
import { callsIn } from '@smarteverything/flow/compile/manifest';
import { PLAN, type Plan } from '@smarteverything/flow/compile/plan';
import { interfaceOf } from '@smarteverything/flow/functions/interface-hash';
import type { FunctionInterface } from '@smarteverything/flow/functions/interface-hash';
import type { PlanRef } from '@smarteverything/flow/state/run-state';
import { storeUnit } from '../store/host/unit';
import type { Store } from '../store/store';
import type { AutomationFunctionsRepository } from '../store/repositories/automation-functions';
import type {
  AutomationNodeStateRepository,
  NodeStateRow,
} from '../store/repositories/automation-node-state';
import type {
  AutomationOwnedValuesRepository,
  OwnedValueRow,
} from '../store/repositories/automation-owned-values';
import type { AutomationPlansRepository } from '../store/repositories/automation-plans';
import type { AutomationRunRecordsRepository } from '../store/repositories/automation-run-records';

export interface EngineRows {
  readonly plans: Pick<AutomationPlansRepository, 'put' | 'find'>;
  readonly functions: Pick<AutomationFunctionsRepository, 'find' | 'latest' | 'findRevision'>;
  readonly owned: Pick<AutomationOwnedValuesRepository, 'list' | 'create'>;
  readonly state: Pick<AutomationNodeStateRepository, 'forAutomation'>;
  readonly records: Pick<AutomationRunRecordsRepository, 'interruptUnfinished' | 'waiting'>;
}

export interface PlanBundle {
  readonly plans: Readonly<Record<string, Plan>>;
  readonly interfaces: Readonly<Record<string, FunctionInterface>>;
}

export interface CalleeSet extends PlanBundle {
  readonly refs: readonly PlanRef[];
}

export interface MemoryRows {
  readonly owned: readonly OwnedValueRow[];
  readonly state: readonly NodeStateRow[];
}

export interface PersistedVariable {
  readonly name: string;
  readonly type: FlowType;
  readonly value: JsonValue;
}

export interface PrepareRequest {
  readonly automationId: string;
  readonly plan: Readonly<Record<string, JsonValue>>;
  readonly variables: readonly PersistedVariable[];
}

export interface Prepared extends CalleeSet {
  readonly hash: string;
  readonly memory: MemoryRows;
}

export interface StoredPlansRequest {
  readonly hashes: readonly string[];
  readonly functions: readonly Pick<PlanRef, 'id' | 'revision'>[];
}

export function interfaceKey(id: string, revision: number): string {
  return `${id}@${String(revision)}`;
}

function storedPlan(rows: Pick<EngineRows, 'plans'>, hash: string): Plan | undefined {
  const found = rows.plans.find(hash);
  return found === undefined ? undefined : PLAN.parse(JSON.parse(found.json));
}

export function calleesOf(rows: Pick<EngineRows, 'plans' | 'functions'>, plan: Plan): CalleeSet {
  const refs = new Map<string, PlanRef>();
  const plans: Record<string, Plan> = {};
  const interfaces: Record<string, FunctionInterface> = {};
  const visit = (current: Plan): void => {
    for (const callee of callsIn(current)) {
      const { functions } = rows;
      const row =
        callee.pin !== undefined
          ? functions.findRevision(callee.fn, callee.pin)
          : functions.find(callee.fn) === undefined
            ? undefined
            : functions.latest(callee.fn);
      if (row === undefined) continue;
      const key = interfaceKey(callee.fn, row.revision);
      if (refs.has(key)) continue;
      refs.set(key, { id: callee.fn, revision: row.revision, hash: row.plan_hash });
      interfaces[key] = interfaceOf(row.definition);
      const found = storedPlan(rows, row.plan_hash);
      if (found === undefined)
        throw new ApiError('not_found', `The plan ${row.plan_hash} is not stored.`);
      plans[row.plan_hash] = found;
      visit(found);
    }
  };
  visit(plan);
  return { refs: [...refs.values()], plans, interfaces };
}

export function memoryOf(
  rows: Pick<EngineRows, 'owned' | 'state'>,
  automationId: string,
): MemoryRows {
  return { owned: rows.owned.list(automationId), state: rows.state.forAutomation(automationId) };
}

export function prepareAutomation(rows: EngineRows, request: PrepareRequest): Prepared {
  const { automationId } = request;
  const hash = rows.plans.put('automation', request.plan);
  for (const variable of request.variables) {
    if (rows.owned.list(automationId).some((row) => row.content.name === variable.name)) continue;
    rows.owned.create(automationId, { kind: 'typed', ...variable });
  }
  return {
    hash,
    ...calleesOf(rows, PLAN.parse(request.plan)),
    memory: memoryOf(rows, automationId),
  };
}

export function storedPlans(
  rows: Pick<EngineRows, 'plans' | 'functions'>,
  request: StoredPlansRequest,
): PlanBundle {
  const plans: Record<string, Plan> = {};
  const interfaces: Record<string, FunctionInterface> = {};
  for (const hash of request.hashes) {
    const found = storedPlan(rows, hash);
    if (found !== undefined) plans[hash] = found;
  }
  for (const { id, revision } of request.functions) {
    const row = rows.functions.findRevision(id, revision);
    if (row !== undefined) interfaces[interfaceKey(id, revision)] = interfaceOf(row.definition);
  }
  return { plans, interfaces };
}

export function bootRecords(rows: Pick<EngineRows, 'records'>): readonly AutomationRunRecord[] {
  rows.records.interruptUnfinished();
  return rows.records.waiting();
}

export function engineRowsOf(store: Store): EngineRows {
  return {
    plans: store.automationPlans,
    functions: store.automationFunctions,
    owned: store.automationOwnedValues,
    state: store.automationNodeState,
    records: store.automationRunRecords,
  };
}

export const PREPARE_AUTOMATION_UNIT = storeUnit((store, request: PrepareRequest): Prepared =>
  prepareAutomation(engineRowsOf(store), request),
);

export const BOOT_AUTOMATION_RUNS_UNIT = storeUnit(
  (store, _input: null): readonly AutomationRunRecord[] => bootRecords(engineRowsOf(store)),
);

export const AUTOMATION_CALLEES_UNIT = storeUnit(
  (store, plan: Readonly<Record<string, JsonValue>>): CalleeSet =>
    calleesOf(engineRowsOf(store), PLAN.parse(plan)),
);

export const AUTOMATION_STORED_PLANS_UNIT = storeUnit(
  (store, request: StoredPlansRequest): PlanBundle => storedPlans(engineRowsOf(store), request),
);

export const AUTOMATION_MEMORY_UNIT = storeUnit((store, automationId: string): MemoryRows =>
  memoryOf(engineRowsOf(store), automationId),
);

export interface AutomationAuthor {
  readonly name: string | null;
  readonly profileId: string;
  readonly origin: StoredAutomationRow['origin'] | null;
}

export const AUTOMATION_AUTHOR_UNIT = storeUnit((store, automationId: string): AutomationAuthor => {
  const row = store.automations.find(automationId);
  return {
    name: row?.name ?? null,
    profileId: row?.author?.profile_id ?? store.profiles.first().id,
    origin: row?.origin ?? null,
  };
});

export const AUTOMATION_CHAT_UNIT = storeUnit((store, chat: NewChat): AiChatRow => {
  if (chat.sourceKey === null)
    throw new ApiError('invalid_request', 'An automation chat needs a source.');
  return store.aiChats.bySource(chat.profileId, chat.sourceKey) ?? store.aiChats.create(chat);
});
