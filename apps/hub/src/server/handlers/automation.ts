import { authorSpeechAutomation } from '../../automations/speech-authoring';
import { speechPrincipal } from '../../transcripts/speech-principal';
import { readableSpeechSources } from '../../transcripts/speech-catalogue';
import { AUTOMATION_DEFINITION } from '@smarteverything/domain';
import { requestSequence } from '../request-signal';
import {
  validateAutomationProgram,
  validateValueConditions,
} from '../../automations/validate-program';
import { automationProgram, programActions } from '../../automations/program';
import {
  API_ENDPOINTS as E,
  ApiError,
  CommandRefusedError,
  InvalidValueError,
  SCENE_ACTIONS,
  validateCommand,
  type Action,
  type AutomationDefinition,
  type PluginOrigin,
  walkActions,
} from '@smarteverything/domain';
import { pluginOriginOf } from '../../ai-tools/plugin-turn';
import { currentExecutionAuthorities } from '../../assistant/execution-authority';
import type { ToolHub } from '../../ai-tools/tool-hub';
import type { LayoutOwner } from '../../store/repositories/personal';
import type { Store } from '../../store/store';
import type { AutomationChange } from '../../store/repositories/automations';
import { clientOf, profileIdOf, type Caller } from '../auth';
import { checkedCommands, commandPrincipal, sourcedBy } from '../commands';
import type { ServerContext } from '../context';
import { invalid } from '../errors';
import { requireKnownSignals, requireOwnerForAiActions } from './signals';
import { DONE_REPLY, bound, type Bound } from '../router';

type SceneRoutes = Record<
  'listScenes' | 'createScene' | 'updateScene' | 'orderScenes' | 'removeScene' | 'runScene',
  Bound
>;

type AutomationRoutes = Record<
  | 'listSpeechSources'
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
      return hub.submit(
        checkedCommands(store, sourcedBy(caller, inputs), commandPrincipal(store, caller)),
      );
    }),
  };
}

function problemWith(action: Action, store: Pick<Store, 'devices'>, tools: ToolHub): string | null {
  if (action.type === 'tool') {
    const check = tools.check(action.tool, action.args);
    return check.ok ? null : `${action.tool} would be refused: ${check.reason}`;
  }
  if (action.type !== 'command' || 'binding' in action) {
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

export function authoredActions(
  tools: ToolHub,
  caller: Caller,
  actions: readonly Action[],
): PluginOrigin | null {
  const plugin = caller.kind === 'client' ? pluginOriginOf(caller) : null;
  if (plugin !== null) {
    for (const action of walkActions(actions)) {
      const refusal =
        action.type === 'tool' ? tools.pluginTurnRefusal(action.tool, action.args) : null;
      if (refusal !== null) throw refusal;
    }
  }
  return plugin;
}

function authored(
  store: Store,
  tools: ToolHub,
  caller: Caller,
  definition: AutomationDefinition,
): AutomationDefinition {
  return {
    ...definition,
    origin: authoredActions(
      tools,
      caller,
      programActions(automationProgram(store, definition.actions)),
    ),
  };
}

export function reauthorizationProfile(store: Store, caller: Caller): string | undefined {
  if (
    caller.kind !== 'client' ||
    caller.client.role !== 'owner' ||
    caller.via !== undefined ||
    caller.authority !== undefined ||
    caller.mcpOrigin !== undefined ||
    caller.pluginId !== undefined ||
    caller.pluginRequester !== undefined ||
    currentExecutionAuthorities().length > 0
  )
    return undefined;
  return profileIdOf(store, caller);
}

function saveAutomation(
  store: Store,
  tools: ToolHub,
  input: {
    readonly id: string;
    readonly change: AutomationChange;
    readonly caller: Caller;
  },
): ReturnType<Store['automations']['update']> {
  const { id, change, caller } = input;
  if (change.definition !== undefined) {
    const actions = validateAutomationProgram(store, change.definition.actions);
    validateValueConditions(store, change.definition.conditions);
    requireOwnerForAiActions(caller, { actions: [...actions] });
    requireKnownSignals(store, change.definition);
    requireRunnableActions(store, tools, { actions: [...actions] });
  }
  return authorSpeechAutomation(store, caller, {
    definition:
      change.definition ?? AUTOMATION_DEFINITION.parse(store.automations.byId(id).definition),
    save: () =>
      store.automations.update(
        id,
        {
          ...change,
          definition:
            change.definition === undefined
              ? undefined
              : authored(store, tools, caller, change.definition),
        },
        reauthorizationProfile(store, caller),
      ),
    id,
  });
}

export function automationRoutes(context: ServerContext, tools: ToolHub): AutomationRoutes {
  const { store, hub } = context;
  return {
    listSpeechSources: bound(E.listSpeechSources, ({ caller }) =>
      readableSpeechSources(store, speechPrincipal(store, caller)),
    ),
    listAutomations: bound(E.listAutomations, () => store.automations.list()),
    createAutomation: bound(E.createAutomation, ({ body, caller }) => {
      const actions = validateAutomationProgram(store, body.definition.actions);
      validateValueConditions(store, body.definition.conditions);
      requireOwnerForAiActions(caller, { actions: [...actions] });
      requireKnownSignals(store, body.definition);
      requireRunnableActions(store, tools, { actions: [...actions] });
      return authorSpeechAutomation(store, caller, {
        definition: body.definition,
        save: () =>
          store.automations.create({
            ...body,
            definition: authored(store, tools, caller, body.definition),
          }),
      });
    }),
    updateAutomation: bound(E.updateAutomation, ({ params, body, caller }) =>
      saveAutomation(store, tools, { id: params.automationId, change: body, caller }),
    ),
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
      store.personal.saveLayout(ownerOf(store, caller), params.page, body.layout, requestSequence),
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
