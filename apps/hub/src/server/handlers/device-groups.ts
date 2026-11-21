import {
  API_ENDPOINTS as E,
  type DeviceGroupInput,
  type DeviceGroupRow,
} from '@smarteverything/domain';
import { submitPreparedTarget } from '../../device-groups/commands';
import { checkedCommands, commandPrincipal, sourcedBy } from '../commands';
import { refusal } from '../person-access';
import type { ServerContext } from '../context';
import { bound, DONE_REPLY } from '../router';
import type { Caller } from '../auth';

async function savedGroup(
  context: ServerContext,
  caller: Caller,
  groupId: string | null,
  input: DeviceGroupInput,
): Promise<DeviceGroupRow> {
  const saved = await context.store.host.write('saveDeviceGroup', { caller, groupId, input });
  if (saved.kind === 'refused') throw refusal(context.store, saved.subject, saved.why);
  return saved.value;
}

export const deviceGroupRoutes = (context: ServerContext) =>
  ({
    listDeviceGroups: bound(E.listDeviceGroups, ({ caller }) =>
      context.store.host.read('visibleDeviceGroups', caller),
    ),
    createDeviceGroup: bound(E.createDeviceGroup, ({ body, caller }) =>
      savedGroup(context, caller, null, body),
    ),
    updateDeviceGroup: bound(E.updateDeviceGroup, ({ params, body, caller }) =>
      savedGroup(context, caller, params.groupId, body),
    ),
    removeDeviceGroup: bound(E.removeDeviceGroup, async ({ params }) => {
      await context.store.host.call('deviceGroups', 'remove', params.groupId);
      return DONE_REPLY;
    }),
    sendTargetCommands: bound(E.sendTargetCommands, async ({ body, caller }) =>
      submitPreparedTarget(
        await context.store.host.read('targetCommandPlan', { caller, body }),
        async (commands) =>
          context.hub.submit(
            await checkedCommands(
              context.store,
              sourcedBy(
                caller,
                commands.map((command) => ({ ...command, source: 'app' })),
              ),
              await commandPrincipal(context.store, caller),
            ),
          ),
      ),
    ),
  }) as const;
