import { API_ENDPOINTS as E, ApiError, SCENE_ACTIONS } from '@smarteverything/domain';
import { assertPhoneCommandAllowed } from '../../phones/phone-access';
import type { Store } from '../../store/store';
import { profileIdOf, type Caller } from '../auth';
import { checkedCommands, commandPrincipal, commandRole, sourcedBy } from '../commands';
import type { ServerContext } from '../context';
import { invalid } from '../errors';
import { assertDevicesReach, deviceIdReachable, deviceScopeOf } from '../person-scope';
import { DONE_REPLY, bound } from '../router';
import { sceneDeviceIds } from '../snapshot-reach';

export function requirePhoneAccess(
  store: Store,
  caller: Caller,
  actions: readonly { readonly deviceId: string | null; readonly capability: string }[],
): void {
  const viewer = { role: commandRole(caller), profileId: profileIdOf(store, caller) };
  for (const action of actions) {
    const device = action.deviceId === null ? undefined : store.devices.find(action.deviceId);
    if (device !== undefined) assertPhoneCommandAllowed(device, action.capability, viewer);
  }
}

export const sceneRoutes = ({ store, hub }: ServerContext) =>
  ({
    listScenes: bound(E.listScenes, ({ caller }) => {
      const scope = deviceScopeOf(store, caller);
      return store.scenes
        .list()
        .filter((scene) =>
          sceneDeviceIds(scene.actions).every((id) => deviceIdReachable(store, scope, id)),
        );
    }),
    createScene: bound(E.createScene, ({ body, caller }) => {
      assertDevicesReach(store, caller, sceneDeviceIds(body.actions));
      requirePhoneAccess(store, caller, body.actions);
      return store.scenes.create(body);
    }),
    updateScene: bound(E.updateScene, ({ params, body, caller }) => {
      if (body.actions !== undefined) {
        assertDevicesReach(store, caller, sceneDeviceIds(body.actions));
        requirePhoneAccess(store, caller, body.actions);
      }
      return store.scenes.update(params.sceneId, body);
    }),
    orderScenes: bound(E.orderScenes, ({ body }) => store.scenes.order(body.ids)),
    removeScene: bound(E.removeScene, ({ params }) => {
      store.scenes.remove(params.sceneId);
      return DONE_REPLY;
    }),
    runScene: bound(E.runScene, ({ params, caller }) => {
      const scene = store.scenes.byId(params.sceneId);
      const actions = SCENE_ACTIONS.safeParse(scene.actions);
      if (!actions.success) {
        throw invalid(`scene ${scene.name}`, actions.error);
      }
      if (actions.data.length === 0) {
        throw new ApiError('command_refused', `The scene ${scene.name} has no actions.`);
      }
      const inputs = actions.data.map((action) => ({
        device_id: action.deviceId,
        capability: action.capability,
        value: action.value,
        source: 'scene' as const,
      }));
      return hub.submit(
        checkedCommands(store, sourcedBy(caller, inputs), commandPrincipal(store, caller)),
      );
    }),
  }) as const;
