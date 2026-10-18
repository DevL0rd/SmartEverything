import { API_ENDPOINTS as E, deviceEffectSupport } from '@smarteverything/domain';
import type { ServerContext } from '../context';
import { bound, DONE_REPLY } from '../router';

export const deviceEffectRoutes = ({ store, hub }: ServerContext) =>
  ({
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
    endDeviceEffect: bound(E.endDeviceEffect, async ({ params }) => {
      await hub.endDeviceEffect(params.effectId);
      return DONE_REPLY;
    }),
  }) as const;
