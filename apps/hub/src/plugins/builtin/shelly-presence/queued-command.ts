import {
  CommandRefusedError,
  SHELLY_PRESENCE_ACTION,
  SHELLY_PRESENCE_DETECTION_CAPABILITY,
  SHELLY_PRESENCE_OPERATION_CAPABILITY,
  type DeviceCommand,
  type JsonValue,
  type ShellyPresenceAction,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
import type { ToolCaller } from '../../../ai-tools/hub-tool';
import { componentCommand } from './component-command';
import { shellyActionPermission } from './action-rules';
export function queuedShellyAction(
  snapshot: ShellyPresenceDevice,
  command: DeviceCommand,
  input: JsonValue | undefined,
): ShellyPresenceAction {
  const component = componentCommand(snapshot, command);
  if (component !== null) return component;
  if (command.capability === SHELLY_PRESENCE_DETECTION_CAPABILITY)
    return SHELLY_PRESENCE_ACTION.parse({ action: 'set_detection', enable: command.value });
  if (command.capability !== SHELLY_PRESENCE_OPERATION_CAPABILITY)
    throw new CommandRefusedError(command.capability, 'unsupported Shelly command');
  return SHELLY_PRESENCE_ACTION.parse(input ?? command.value);
}
export function validateQueuedShellyAction(
  command: DeviceCommand,
  action: ShellyPresenceAction,
  caller: ToolCaller | null,
): void {
  const permission = shellyActionPermission(action);
  if (permission !== 'write' && caller?.role !== 'owner')
    throw new CommandRefusedError(
      command.capability,
      'this operation requires an owner-validated Shelly tool',
    );
  if (permission === 'access' && (caller?.via !== 'app' || caller.pluginRequester !== undefined))
    throw new CommandRefusedError(command.capability, 'access grants require a person in the app');
}
