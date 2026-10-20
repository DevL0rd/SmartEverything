import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import type { StateMemoryPort } from '@smarteverything/flow/interpret/state-ops';
import { TIMER_SLOT_PREFIX } from '@smarteverything/flow/nodes/state/timer';
import type { AutomationNodeStateRepository } from '../../store/repositories/automation-node-state';

const MEMORY_PARTITION = 'read';
export const STATE_PARTITION = 'state';

export interface NodeMemory {
  readonly recall: (automationId: string, nodeId: string) => JsonValue | undefined;
  readonly keep: (automationId: string, nodeId: string, memory: JsonValue) => void;
}

export function nodeMemoryFromState(
  state: Pick<AutomationNodeStateRepository, 'get' | 'save'>,
): NodeMemory {
  return {
    recall: (automationId, nodeId): JsonValue | undefined => {
      const row = state.get(automationId, nodeId, MEMORY_PARTITION);
      return row === undefined ? undefined : JSON_VALUE.parse(row.state);
    },
    keep: (automationId, nodeId, memory): void => {
      state.save({ automationId, nodeId, partition: MEMORY_PARTITION, state: memory });
    },
  };
}

export function transientNodeMemory(): NodeMemory {
  const kept = new Map<string, JsonValue>();
  const keyOf = (automationId: string, nodeId: string): string => `${automationId}/${nodeId}`;
  return {
    recall: (automationId, nodeId): JsonValue | undefined => kept.get(keyOf(automationId, nodeId)),
    keep: (automationId, nodeId, memory): void => {
      kept.set(keyOf(automationId, nodeId), memory);
    },
  };
}

export function stateMemoryFromRows(
  rows: Pick<AutomationNodeStateRepository, 'get' | 'save'>,
  wakes?: { readonly changed: () => void },
): StateMemoryPort {
  return {
    recall: (automationId, slot): JsonValue | undefined => {
      const row = rows.get(automationId, slot, STATE_PARTITION);
      return row === undefined ? undefined : JSON_VALUE.parse(row.state);
    },
    keep: (automationId, slot, memory, wakeAt): void => {
      rows.save({
        automationId,
        nodeId: slot,
        partition: STATE_PARTITION,
        state: memory,
        wakeAt: wakeAt === null ? null : new Date(wakeAt).toISOString(),
      });
      if (slot.startsWith(TIMER_SLOT_PREFIX)) wakes?.changed();
    },
  };
}

export function transientStateMemory(): StateMemoryPort {
  const held = new Map<string, JsonValue>();
  return {
    recall: (automationId, slot): JsonValue | undefined => held.get(`${automationId}/${slot}`),
    keep: (automationId, slot, memory): void => {
      held.set(`${automationId}/${slot}`, memory);
    },
  };
}

export function overlaidStateMemory(
  over: StateMemoryPort,
  base: Pick<StateMemoryPort, 'recall'>,
): StateMemoryPort {
  return {
    recall: (automationId, slot) =>
      over.recall(automationId, slot) ?? base.recall(automationId, slot),
    keep: (automationId, slot, memory, wakeAt): void => {
      over.keep(automationId, slot, memory, wakeAt);
    },
  };
}
