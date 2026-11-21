import {
  COMMAND_CAUSE_WINDOW_MS,
  type DeviceLogCauseKind,
  type StateChange,
} from '@smarteverything/domain';
import { causesFor } from '../../devices/device-log/causes';
import { storeUnit } from '../../store/host/unit';

export interface FoundCause {
  readonly kind: DeviceLogCauseKind;
  readonly commandId: string;
}

export const STATE_CHANGE_CAUSE_UNIT = storeUnit(
  (
    store,
    { change, at }: { readonly change: StateChange; readonly at: string },
  ): FoundCause | null => {
    const happened = Date.parse(at);
    const commands = store.commands.ofDevice(change.deviceId, {
      from: new Date(happened - COMMAND_CAUSE_WINDOW_MS).toISOString(),
      to: new Date(happened + 1).toISOString(),
      capabilities: [change.capability],
    });
    if (commands.length === 0) return null;
    const causes = causesFor(store, commands);
    const command = causes.nearest(commands, change.capability, at);
    if (command === undefined) return null;
    return { kind: causes.ofCommand(command).kind, commandId: command.id };
  },
);
