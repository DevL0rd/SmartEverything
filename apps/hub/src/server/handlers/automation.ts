import { API_ENDPOINTS as E, ApiError, SCENE_ACTIONS } from '@smarteverything/domain';
import type { LayoutOwner } from '../../store/repositories/personal';
import type { Store } from '../../store/store';
import { clientOf, profileIdOf, type Caller } from '../auth';
import { checkedCommands } from '../commands';
import type { ServerContext } from '../context';
import { invalid } from '../errors';
import { requireOwnerForAiActions } from './signals';
import { DONE_REPLY, bound, type Bound } from '../router';

type SceneRoutes = Record<
  'listScenes' | 'createScene' | 'updateScene' | 'orderScenes' | 'removeScene' | 'runScene',
  Bound
>;

type AutomationRoutes = Record<
  | 'listAutomations'
  | 'createAutomation'
  | 'updateAutomation'
  | 'removeAutomation'
  | 'runAutomation'
  | 'readLayout'
  | 'saveLayout'
  | 'listPushTargets'
  | 'savePushTarget'
  | 'removePushTarget',
  Bound
>;

function ownerOf(store: Store, caller: Caller): LayoutOwner {
  return { clientId: clientOf(caller).id, profileId: profileIdOf(store, caller) };
}

export function sceneRoutes(context: ServerContext): SceneRoutes {
  const { store, hub } = context;
  return {
    listScenes: bound(E.listScenes, () => store.scenes.list()),
    createScene: bound(E.createScene, ({ body }) => store.scenes.create(body)),
    updateScene: bound(E.updateScene, ({ params, body }) =>
      store.scenes.update(params.sceneId, body),
    ),
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
      return hub.submit(checkedCommands(store, inputs, clientOf(caller)));
    }),
  };
}

export function automationRoutes(context: ServerContext): AutomationRoutes {
  const { store, hub } = context;
  return {
    listAutomations: bound(E.listAutomations, () => store.automations.list()),
    createAutomation: bound(E.createAutomation, ({ body, caller }) => {
      requireOwnerForAiActions(caller, body.definition);
      return store.automations.create(body);
    }),
    updateAutomation: bound(E.updateAutomation, ({ params, body, caller }) => {
      if (body.definition !== undefined) {
        requireOwnerForAiActions(caller, body.definition);
      }
      return store.automations.update(params.automationId, body);
    }),
    removeAutomation: bound(E.removeAutomation, ({ params }) => {
      store.automations.remove(params.automationId);
      return DONE_REPLY;
    }),
    runAutomation: bound(E.runAutomation, async ({ params }) => {
      await hub.runAutomation(params.automationId);
      return DONE_REPLY;
    }),
    readLayout: bound(E.readLayout, ({ params, caller }) => ({
      layout: store.personal.layout(ownerOf(store, caller), params.page)?.layout ?? null,
    })),
    saveLayout: bound(E.saveLayout, ({ params, body, caller }) =>
      store.personal.saveLayout(ownerOf(store, caller), params.page, body.layout),
    ),
    listPushTargets: bound(E.listPushTargets, () => store.personal.pushTargets()),
    savePushTarget: bound(E.savePushTarget, ({ body, caller }) =>
      store.personal.savePushTarget(body.token, clientOf(caller).id, body.platform),
    ),
    removePushTarget: bound(E.removePushTarget, ({ body, caller }) => {
      store.personal.removePushTarget(body.token, clientOf(caller).id);
      return DONE_REPLY;
    }),
  };
}
