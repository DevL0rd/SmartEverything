import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { clientOf } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';

export const developerRoutes = ({ developerDevices, watchCaptures, store }: ServerContext) =>
  ({
    readDeveloperDevice: bound(E.readDeveloperDevice, ({ caller }) => ({
      developer: developerDevices.isDeveloper(clientOf(caller)),
    })),
    setDeveloperDevice: bound(E.setDeveloperDevice, ({ body, caller }) => ({
      developer: developerDevices.set(clientOf(caller), body.developer),
    })),
    saveWatchCaptures: bound(E.saveWatchCaptures, async ({ body, caller }) => {
      const client = clientOf(caller);
      developerDevices.require(client);
      store.devices.byId(body.deviceId);
      const saved = await watchCaptures.save(
        { deviceId: body.deviceId, clientId: client.id },
        body.files,
      );
      return { stored: [...saved.stored], duplicates: [...saved.duplicates] };
    }),
    readWatchCaptures: bound(E.readWatchCaptures, ({ caller }) => {
      developerDevices.require(clientOf(caller));
      return watchCaptures.summary();
    }),
    clearWatchCaptures: bound(E.clearWatchCaptures, async ({ caller }) => {
      const client = clientOf(caller);
      developerDevices.require(client);
      await watchCaptures.clear(client.id);
      return DONE_REPLY;
    }),
  }) as const;
