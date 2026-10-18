import { presentDevice, type DeviceLogEntry } from '@smarteverything/domain';
import { causesFor } from './causes';
import type { DeviceLogSource, LogRequest, LogStore } from './types';

export function actionsSource(): DeviceLogSource {
  return { claims: () => false, read: readActions };
}

function readActions(store: LogStore, request: LogRequest): readonly DeviceLogEntry[] {
  const { device, to, limit } = request;
  const actions = new Map<string, string>(
    presentDevice(device)
      .capabilities.filter((presented) => presented.capability.value.kind === 'action')
      .map((presented) => [presented.key, presented.label]),
  );
  if (actions.size === 0) return [];
  const commands = store.commands
    .ofDevice(device.id, { to, capabilities: [...actions.keys()] })
    .filter((command) => command.status === 'succeeded')
    .slice(0, limit);
  const causes = causesFor(store, commands);
  return commands.flatMap((command): DeviceLogEntry[] => {
    const title = actions.get(command.capability);
    return title === undefined
      ? []
      : [{ at: command.created_at, kind: 'run', title, cause: causes.ofCommand(command) }];
  });
}
