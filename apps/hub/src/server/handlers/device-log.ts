import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { viewerOf } from '../../computers/computer-access';
import { phoneViewerOfCaller } from '../../phones/phone-detail';
import { otherPhoneTiers } from '../../phones/phone-visibility';
import { changeLaundryNotices, pressDeviceButton, recordRefill } from '../../devices/press';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';

export const deviceLogRoutes = ({ store, hub }: ServerContext) =>
  ({
    readDeviceLog: bound(E.readDeviceLog, async ({ params, query, caller }) => {
      const device = await store.host.call('devices', 'byId', params.deviceId);
      await store.live.computerAccess.load();
      if (store.live.computerAccess.hidden(viewerOf(caller), device)) {
        throw new ApiError('not_found', 'There is no such device.');
      }
      const tier = otherPhoneTiers([device], phoneViewerOfCaller(caller)).get(device.id);
      return await store.host.read('deviceLog', {
        device,
        to: query.to,
        limit: query.limit,
        tier: tier ?? null,
      });
    }),
    pressDeviceButton: bound(E.pressDeviceButton, async ({ params, body, caller }) =>
      pressDeviceButton(
        { store, hub },
        await store.host.call('devices', 'byId', params.deviceId),
        body.action,
        caller,
      ),
    ),
    recordDeviceRefill: bound(E.recordDeviceRefill, async ({ params, caller }) => {
      await recordRefill(
        { store, hub },
        await store.host.call('devices', 'byId', params.deviceId),
        caller,
      );
      return DONE_REPLY;
    }),
    updateLaundryNotices: bound(E.updateLaundryNotices, async ({ params, body }) =>
      changeLaundryNotices(store, await store.host.call('devices', 'byId', params.deviceId), body),
    ),
  }) as const;
