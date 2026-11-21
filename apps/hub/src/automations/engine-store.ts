import type { AutomationRunRecord, StoredAutomationRow } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { StoreHost } from '../store/host/host';
import type {
  AutomationNodeStateRepository,
  NodeStateWrite,
} from '../store/repositories/automation-node-state';
import type {
  AutomationOwnedValuesRepository,
  OwnedValueContent,
} from '../store/repositories/automation-owned-values';
import type { AutomationProgramsRepository } from '../store/repositories/automation-programs';
import {
  bootRecords,
  calleesOf,
  memoryOf,
  prepareAutomation,
  storedPlans,
  type CalleeSet,
  type EngineRows,
  type MemoryRows,
  type PlanBundle,
  type Prepared,
  type PrepareRequest,
  type StoredPlansRequest,
} from './engine-units';
import { PLAN } from '@smarteverything/flow/compile/plan';

export interface MemoryWrites {
  readonly saveState: (write: NodeStateWrite) => void;
  readonly writeOwned: (
    automationId: string,
    id: string,
    content: OwnedValueContent,
    expectedRevision: number,
  ) => void;
}

export interface EngineStore {
  readonly programs: () => Promise<readonly StoredAutomationRow[]>;
  readonly program: (automationId: string) => Promise<StoredAutomationRow | undefined>;
  readonly prepare: (request: PrepareRequest) => Promise<Prepared>;
  readonly callees: (plan: Readonly<Record<string, JsonValue>>) => Promise<CalleeSet>;
  readonly stored: (request: StoredPlansRequest) => Promise<PlanBundle>;
  readonly memory: (automationId: string) => Promise<MemoryRows>;
  readonly boot: () => Promise<readonly AutomationRunRecord[]>;
  readonly writes: MemoryWrites;
}

export function hostEngineStore(host: StoreHost): EngineStore {
  return {
    programs: () => host.call('automations', 'list'),
    program: (automationId) => host.call('automations', 'find', automationId),
    prepare: (request) => host.write('prepareAutomation', request),
    callees: (plan) => host.read('automationCallees', plan),
    stored: (request) => host.read('automationStoredPlans', request),
    memory: (automationId) => host.write('automationMemory', automationId),
    boot: () => host.write('bootAutomationRuns', null),
    writes: {
      saveState: (write): void => {
        background(
          host.call('automationNodeState', 'save', write),
          'automation.state_write_failed',
          {
            automationId: write.automationId,
          },
        );
      },
      writeOwned: (automationId, id, content, expectedRevision): void => {
        background(
          host.call('automationOwnedValues', 'write', automationId, id, content, expectedRevision),
          'automation.state_write_failed',
          { automationId },
        );
      },
    },
  };
}

export interface DirectEngineRows extends EngineRows {
  readonly programs: Pick<AutomationProgramsRepository, 'list' | 'find'>;
  readonly owned: Pick<AutomationOwnedValuesRepository, 'list' | 'create' | 'write'>;
  readonly state: Pick<AutomationNodeStateRepository, 'forAutomation' | 'save'>;
}

export function directEngineStore(rows: DirectEngineRows): EngineStore {
  return {
    programs: () => Promise.resolve(rows.programs.list()),
    program: (automationId) => Promise.resolve(rows.programs.find(automationId)),
    prepare: (request) => Promise.resolve(prepareAutomation(rows, request)),
    callees: (plan) => Promise.resolve(calleesOf(rows, PLAN.parse(plan))),
    stored: (request) => Promise.resolve(storedPlans(rows, request)),
    memory: (automationId) => Promise.resolve(memoryOf(rows, automationId)),
    boot: () => Promise.resolve(bootRecords(rows)),
    writes: {
      saveState: (write): void => {
        rows.state.save(write);
      },
      writeOwned: (automationId, id, content, expectedRevision): void => {
        rows.owned.write(automationId, id, content, expectedRevision);
      },
    },
  };
}
