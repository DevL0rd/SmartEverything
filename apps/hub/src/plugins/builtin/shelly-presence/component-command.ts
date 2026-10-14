import {
  ApiError,
  SHELLY_PRESENCE_ACTION,
  type DeviceCommand,
  type ShellyPresenceAction,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
import { z } from 'zod';
export function componentCommand(
  snapshot: ShellyPresenceDevice,
  command: DeviceCommand,
): ShellyPresenceAction | null {
  const prefix = 'raw:shelly.component.';
  if (!command.capability.startsWith(prefix)) return null;
  const key = command.capability.slice(prefix.length);
  const component = snapshot.components.find((candidate) => candidate.key === key);
  if (component === undefined || !('id' in component.config))
    throw new ApiError('not_found', 'That component no longer exists.');
  if (component.component === 'button')
    return SHELLY_PRESENCE_ACTION.parse({
      action: 'virtual_button',
      id: component.config.id,
      event: z.object({ event: z.string() }).parse(command.value).event,
    });
  if (component.component === 'group')
    return SHELLY_PRESENCE_ACTION.parse({
      action: 'virtual_set',
      id: component.config.id,
      setting: {
        component: 'group',
        value: z.object({ value: z.array(z.string()) }).parse(command.value).value,
      },
    });
  return SHELLY_PRESENCE_ACTION.parse({
    action: 'virtual_set',
    id: component.config.id,
    setting: { component: component.component, value: command.value },
  });
}
