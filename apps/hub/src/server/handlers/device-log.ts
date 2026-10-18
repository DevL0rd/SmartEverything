import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { hiddenComputer, viewerOf } from '../../computers/computer-access';
import { readDeviceLog } from '../../devices/device-log/read';
import { phoneViewerOfCaller } from '../../phones/phone-detail';
import { otherPhoneTiers } from '../../phones/phone-visibility';
import { pressDeviceButton, recordRefill } from '../../devices/press';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';

export const deviceLogRoutes = ({ store, hub }: ServerContext) =>
  ({
    readDeviceLog: bound(E.readDeviceLog, ({ params, query, caller }) => {
      const device = store.devices.byId(params.deviceId);
      if (hiddenComputer(store, viewerOf(store, caller), device)) {
        throw new ApiError('not_found', 'There is no such device.');
      }
      const tier = otherPhoneTiers([device], phoneViewerOfCaller(store, caller)).get(device.id);
      return readDeviceLog(store, {
        device,
        to: query.to,
        limit: query.limit,
        tier: tier ?? null,
      });
    }),
    pressDeviceButton: bound(E.pressDeviceButton, ({ params, body, caller }) =>
      pressDeviceButton({ store, hub }, store.devices.byId(params.deviceId), body.action, caller),
    ),
    recordDeviceRefill: bound(E.recordDeviceRefill, async ({ params, caller }) => {
      await recordRefill({ store, hub }, store.devices.byId(params.deviceId), caller);
      return DONE_REPLY;
    }),
  }) as const;
