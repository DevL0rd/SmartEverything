import { ApiError, CommandRefusedError, type DeviceCommand } from '@smarteverything/domain';
import { SHELLY_DETECTION_CAPABILITY, type ShellyDevice } from '@smarteverything/shelly';
import { z } from 'zod';
import type { ShellyRequest } from './operate';

const COMPONENT_PREFIX = 'raw:shelly.component.';
const WITH_ID = z.looseObject({ id: z.int() });

export function shellyRequestOf(device: ShellyDevice, command: DeviceCommand): ShellyRequest {
  if (command.capability === SHELLY_DETECTION_CAPABILITY)
    return { action: 'set_detection', params: { enable: z.boolean().parse(command.value) } };
  if (!command.capability.startsWith(COMPONENT_PREFIX))
    throw new CommandRefusedError(command.capability, 'unsupported Shelly command');
  const key = command.capability.slice(COMPONENT_PREFIX.length);
  const component = device.components.find((candidate) => candidate.key === key);
  if (component === undefined) throw new ApiError('not_found', 'That component no longer exists.');
  const { id } = WITH_ID.parse(component.config);
  if (component.component === 'button')
    return {
      action: 'virtual_button',
      params: { id, event: z.object({ event: z.string() }).parse(command.value).event },
    };
  const value =
    component.component === 'group'
      ? z.object({ value: z.array(z.string()) }).parse(command.value).value
      : command.value;
  return {
    action: 'virtual_set',
    params: { id, setting: { component: component.component, value } },
  };
}
