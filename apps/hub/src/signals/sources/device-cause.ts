import {
  COMMAND_CAUSE_WINDOW_MS,
  type DeviceLogCauseKind,
  type DeviceStateCause,
  type JsonValue,
  type StateChange,
} from '@smarteverything/domain';
import { commandMetadata } from '../../automations/effects/command-metadata';
import { causesFor } from '../../devices/device-log/causes';
import type { LogStore } from '../../devices/device-log/types';

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

export function causeOfStateChange(store: LogStore, change: StateChange, at: string): StateCause {
  const happened = Date.parse(at);
  const commands = store.commands.ofDevice(change.deviceId, {
    from: new Date(happened - COMMAND_CAUSE_WINDOW_MS).toISOString(),
    to: new Date(happened + 1).toISOString(),
    capabilities: [change.capability],
  });
  if (commands.length === 0) return PHYSICAL;
  const causes = causesFor(store, commands);
  const command = causes.nearest(commands, change.capability, at);
  if (command === undefined) return PHYSICAL;
  const stamp = commandMetadata(store).of(command.id, happened);
  return {
    cause: causeOfKind(causes.ofCommand(command).kind),
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
