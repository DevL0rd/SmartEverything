import { API_ENDPOINTS as E, type DeviceGroupInput } from '@smarteverything/domain';
import { prepareTargetCommands, submitPreparedTarget } from '../../device-groups/commands';
import { checkedCommands, commandPrincipal, sourcedBy } from '../commands';
import type { ServerContext } from '../context';
import { bound, DONE_REPLY, type Bound } from '../router';

function checkedMembers(context: ServerContext, input: DeviceGroupInput): DeviceGroupInput {
  input.device_ids.forEach((id) => {
    context.store.devices.byId(id);
  });
  return input;
}

export function deviceGroupRoutes(
  context: ServerContext,
): Record<
  | 'listDeviceGroups'
  | 'createDeviceGroup'
  | 'updateDeviceGroup'
  | 'removeDeviceGroup'
  | 'sendTargetCommands',
  Bound
> {
  const { store, hub } = context;
  return {
    listDeviceGroups: bound(E.listDeviceGroups, () => store.deviceGroups.list()),
    createDeviceGroup: bound(E.createDeviceGroup, ({ body }) =>
      store.deviceGroups.create(checkedMembers(context, body)),
    ),
    updateDeviceGroup: bound(E.updateDeviceGroup, ({ params, body }) =>
      store.deviceGroups.update(params.groupId, checkedMembers(context, body)),
    ),
    removeDeviceGroup: bound(E.removeDeviceGroup, ({ params }) => {
      store.deviceGroups.remove(params.groupId);
      return DONE_REPLY;
    }),
    sendTargetCommands: bound(E.sendTargetCommands, ({ body, caller }) =>
      submitPreparedTarget(prepareTargetCommands(store, body), (commands) =>
        hub.submit(
          checkedCommands(
            store,
            sourcedBy(
              caller,
              commands.map((command) => ({ ...command, source: 'app' })),
            ),
            commandPrincipal(store, caller),
          ),
        ),
      ),
    ),
  };
}
