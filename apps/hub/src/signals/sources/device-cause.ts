import {
  type DeviceLogCauseKind,
  type DeviceStateCause,
  type JsonValue,
  type StateChange,
} from '@smarteverything/domain';
import { commandMetadata } from '../../automations/effects/command-metadata';
import type { Store } from '../../store/store';

function causeOfKind(kind: DeviceLogCauseKind): DeviceStateCause {
  switch (kind) {
    case 'assistant':
      return 'assistant';
    case 'app':
      return 'app';
    case 'schedule':
      return 'schedule';
    case 'automation':
    case 'button':
      return 'automation';
    case 'device':
    case 'unknown':
      return 'physical';
  }
}

export interface StateCause {
  readonly cause: DeviceStateCause;
  readonly facts: Readonly<Record<string, JsonValue>>;
}

const PHYSICAL: StateCause = { cause: 'physical', facts: {} };

export async function causeOfStateChange(
  store: Store,
  change: StateChange,
  at: string,
): Promise<StateCause> {
  const found = await store.host.read('stateChangeCause', { change, at });
  if (found === null) return PHYSICAL;
  const stamp = commandMetadata(store).of(found.commandId, Date.parse(at));
  return {
    cause: causeOfKind(found.kind),
    facts:
      stamp === undefined
        ? {}
        : {
            causeRunId: stamp.causeRunId,
            causeAutomationId: stamp.causeAutomationId,
            causeDepth: stamp.causeDepth,
          },
  };
}
