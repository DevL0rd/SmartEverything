import { API_ENDPOINTS as E, deviceEffectSupport } from '@smarteverything/domain';
import {
  admitExecutionDevice,
  currentExecutionAuthorities,
} from '../../assistant/execution-authority';
import type { ServerContext } from '../context';
import { bound, DONE_REPLY, type Bound } from '../router';

export function deviceEffectRoutes(
  context: ServerContext,
): Record<
  'listDeviceEffects' | 'listDeviceEffectSupport' | 'readDeviceEffectCommand' | 'endDeviceEffect',
  Bound
> {
  const { store, hub } = context;
  return {
    listDeviceEffects: bound(E.listDeviceEffects, () => store.deviceEffects.list()),
    listDeviceEffectSupport: bound(E.listDeviceEffectSupport, () =>
      store.devices.list().flatMap((device) =>
        device.capabilities.map((capability) => {
          const reason = deviceEffectSupport(capability);
          return {
            deviceId: device.id,
            capability: capability.key,
            supported: reason === null,
            relative: reason === null && capability.value.kind === 'number',
            reason,
          };
        }),
      ),
    ),
    readDeviceEffectCommand: bound(
      E.readDeviceEffectCommand,
      ({ params }) => store.deviceEffects.command(params.commandId) ?? null,
    ),
    endDeviceEffect: bound(E.endDeviceEffect, async ({ params }) => {
      const target = store.deviceEffects
        .list()
        .find((row) => row.effects.some((effect) => effect.id === params.effectId));
      if (target !== undefined)
        for (const authority of currentExecutionAuthorities())
          admitExecutionDevice(store, target.device_id, authority);
      await hub.endDeviceEffect(params.effectId);
      return DONE_REPLY;
    }),
  };
}
