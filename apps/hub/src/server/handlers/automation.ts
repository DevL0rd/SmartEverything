import {
  API_ENDPOINTS as E,
  ApiError,
  CommandRefusedError,
  InvalidValueError,
  SCENE_ACTIONS,
  validateCommand,
  type Action,
  type AutomationDefinition,
} from '@smarteverything/domain';
import { pluginOriginOf } from '../../ai-tools/plugin-turn';
import type { ToolHub } from '../../ai-tools/tool-hub';
import type { LayoutOwner } from '../../store/repositories/personal';
import type { Store } from '../../store/store';
import { clientOf, profileIdOf, type Caller } from '../auth';
import { checkedCommands } from '../commands';
import type { ServerContext } from '../context';
import { invalid } from '../errors';
import { requireKnownSignals, requireOwnerForAiActions } from './signals';
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

function problemWith(action: Action, store: Pick<Store, 'devices'>, tools: ToolHub): string | null {
  if (action.type === 'tool') {
    const check = tools.check(action.tool, action.args);
    return check.ok ? null : `${action.tool} would be refused: ${check.reason}`;
  }
  if (action.type !== 'command') {
    return null;
  }
  try {
    validateCommand(store.devices.byId(action.deviceId), action);
    return null;
  } catch (cause) {
    if (cause instanceof CommandRefusedError || cause instanceof InvalidValueError) {
      return `${action.capability} command would be refused: ${cause.message}`;
    }
    throw cause;
  }
}

export function requireRunnableActions(
  store: Pick<Store, 'devices'>,
  tools: ToolHub,
  definition: Pick<AutomationDefinition, 'actions'>,
): void {
  const problems = definition.actions.flatMap((action, index) => {
    const problem = problemWith(action, store, tools);
    return problem === null ? [] : [`Action ${String(index + 1)}: ${problem}`];
  });
  if (problems.length > 0) {
    throw new ApiError(
      'invalid_request',
      `Nothing was saved. ${problems.join('; ')}. Fix these actions and save again.`,
    );
  }
}

function authored(
  tools: ToolHub,
  caller: Caller,
  definition: AutomationDefinition,
): AutomationDefinition {
  const plugin = caller.kind === 'client' ? pluginOriginOf(caller) : null;
  if (plugin !== null) {
    for (const action of definition.actions) {
      const refusal =
        action.type === 'tool' ? tools.pluginTurnRefusal(action.tool, action.args) : null;
      if (refusal !== null) {
        throw refusal;
      }
    }
  }
  return { ...definition, origin: plugin };
}

export function automationRoutes(context: ServerContext, tools: ToolHub): AutomationRoutes {
  const { store, hub } = context;
  return {
    listAutomations: bound(E.listAutomations, () => store.automations.list()),
    createAutomation: bound(E.createAutomation, ({ body, caller }) => {
      requireOwnerForAiActions(caller, body.definition);
      requireKnownSignals(store, body.definition);
      requireRunnableActions(store, tools, body.definition);
      return store.automations.create({
        ...body,
        definition: authored(tools, caller, body.definition),
      });
    }),
    updateAutomation: bound(E.updateAutomation, ({ params, body, caller }) => {
      if (body.definition !== undefined) {
        requireOwnerForAiActions(caller, body.definition);
        requireKnownSignals(store, body.definition);
        requireRunnableActions(store, tools, body.definition);
      }
      return store.automations.update(params.automationId, {
        ...body,
        definition:
          body.definition === undefined ? undefined : authored(tools, caller, body.definition),
      });
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
