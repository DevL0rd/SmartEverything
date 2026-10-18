import { API_ENDPOINTS as E, type DeviceGroupInput } from '@smarteverything/domain';
import { prepareTargetCommands, submitPreparedTarget } from '../../device-groups/commands';
import { checkedCommands, commandPrincipal, sourcedBy } from '../commands';
import { assertDevicesReach, deviceIdReachable, deviceScopeOf } from '../person-scope';
import type { ServerContext } from '../context';
import { bound, DONE_REPLY } from '../router';
import type { Caller } from '../auth';

function checkedMembers(
  context: ServerContext,
  caller: Caller,
  input: DeviceGroupInput,
): DeviceGroupInput {
  input.device_ids.forEach((id) => {
    context.store.devices.byId(id);
  });
  assertDevicesReach(context.store, caller, input.device_ids);
  return input;
}

export const deviceGroupRoutes = (context: ServerContext) =>
  ({
    listDeviceGroups: bound(E.listDeviceGroups, ({ caller }) => {
      const { store } = context;
      const scope = deviceScopeOf(store, caller);
      return store.deviceGroups
        .list()
        .filter((group) => group.device_ids.every((id) => deviceIdReachable(store, scope, id)));
    }),
    createDeviceGroup: bound(E.createDeviceGroup, ({ body, caller }) =>
      context.store.deviceGroups.create(checkedMembers(context, caller, body)),
    ),
    updateDeviceGroup: bound(E.updateDeviceGroup, ({ params, body, caller }) =>
      context.store.deviceGroups.update(params.groupId, checkedMembers(context, caller, body)),
    ),
    removeDeviceGroup: bound(E.removeDeviceGroup, ({ params }) => {
      context.store.deviceGroups.remove(params.groupId);
      return DONE_REPLY;
    }),
    sendTargetCommands: bound(E.sendTargetCommands, ({ body, caller }) =>
      submitPreparedTarget(
        prepareTargetCommands(context.store, body, deviceScopeOf(context.store, caller)),
        (commands) =>
          context.hub.submit(
            checkedCommands(
              context.store,
              sourcedBy(
                caller,
                commands.map((command) => ({ ...command, source: 'app' })),
              ),
              commandPrincipal(context.store, caller),
            ),
          ),
      ),
    ),
  }) as const;
