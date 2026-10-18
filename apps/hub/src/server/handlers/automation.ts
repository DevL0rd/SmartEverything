import { authorSpeechAutomation } from '../../automations/speech-authoring';
import { definitionOf } from '../../automations/definition';
import { requireVisibleComputers } from '../../automations/computer-steps';
import { requirePhoneAccess, requireReachableTargets } from '../../automations/target-reach';
import { assertDevicesReach, deviceIdReachable, deviceScopeOf } from '../person-scope';
import { sceneDeviceIds } from '../snapshot-reach';
import { validateAutomation } from '../../automations/validate-automation';
import {
  API_ENDPOINTS as E,
  ApiError,
  JSON_VALUE,
  SCENE_ACTIONS,
  walkSteps,
  type AutomationAuthor,
  type AutomationToolRow,
  type AutomationV2,
  type PluginOrigin,
} from '@smarteverything/domain';
import { z } from 'zod';
import { requestSequence } from '../request-signal';
import { pluginOriginOf } from '../../ai-tools/plugin-turn';
import type { ToolHub } from '../../ai-tools/tool-hub';
import type { LayoutOwner } from '../../store/repositories/personal';
import type { Store } from '../../store/store';
import type { AutomationChange } from '../../store/repositories/automations';
import { clientOf, profileIdOf, type Caller } from '../auth';
import { checkedCommands, commandPrincipal, sourcedBy } from '../commands';
import type { ServerContext } from '../context';
import { invalid } from '../errors';
import { requireKnownSignals, requireOwnerForAiActions } from './signals';
import { DONE_REPLY, bound } from '../router';

function ownerOf(store: Store, caller: Caller): LayoutOwner {
  return { clientId: clientOf(caller).id, profileId: profileIdOf(store, caller) };
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

function authoredOrigin(
  tools: ToolHub,
  caller: Caller,
  automation: AutomationV2,
): PluginOrigin | null {
  const plugin = caller.kind === 'client' ? pluginOriginOf(caller) : null;
  if (plugin !== null) {
    for (const step of walkSteps(automation.steps)) {
      const refusal =
        step.do === 'tool' ? tools.pluginTurnRefusal(step.tool, step.args ?? {}) : null;
      if (refusal !== null) throw refusal;
    }
  }
  return plugin;
}

function authorOf(store: Store, caller: Caller): AutomationAuthor {
  const assistant =
    caller.kind === 'service' || (caller.kind === 'client' && caller.via === 'assistant');
  return { via: assistant ? 'assistant' : 'person', profile_id: profileIdOf(store, caller) };
}

function validatedDefinition(
  context: ServerContext,
  tools: ToolHub,
  caller: Caller,
  input: { readonly definition: AutomationV2; readonly id?: string | undefined },
): void {
  const { store } = context;
  validateAutomation(
    { store, tools, computers: context.hub.automationComputers },
    input.definition,
    input.id,
  );
  requireOwnerForAiActions(store, caller, input.definition);
  requireVisibleComputers(store, caller, input.definition);
  requireReachableTargets(store, caller, input.definition);
}

function checkedDefinition(
  context: ServerContext,
  tools: ToolHub,
  caller: Caller,
  input: { readonly definition: AutomationV2; readonly id?: string },
): void {
  validatedDefinition(context, tools, caller, input);
  requireKnownSignals(context.store, input.definition);
}

function savedChange(tools: ToolHub, caller: Caller, change: AutomationChange): AutomationChange {
  return change.definition === undefined
    ? change
    : { ...change, origin: authoredOrigin(tools, caller, change.definition) };
}

const clientRoutes = (store: Store) =>
  ({
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
  }) as const;

const runRoutes = (context: ServerContext, tools: ToolHub) =>
  ({
    runAutomation: bound(E.runAutomation, ({ params, body }) =>
      context.hub.runAutomation(params.automationId, {
        inputs: body.inputs ?? {},
        wait: body.wait === true,
      }),
    ),
    testAutomation: bound(E.testAutomation, ({ body, caller }) => {
      validatedDefinition(context, tools, caller, {
        definition: body.definition,
        id: body.automationId,
      });
      return context.hub.testAutomation({
        automationId: body.automationId,
        definition: body.definition,
        inputs: body.inputs ?? {},
        wait: body.wait === true,
      });
    }),
  }) as const;

const INPUT_SCHEMA = z.record(z.string(), JSON_VALUE);

const toolRows = (tools: ToolHub): AutomationToolRow[] =>
  tools.list().map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    input_schema: INPUT_SCHEMA.parse(tool.inputSchema),
    read_only: tool.annotations.readOnlyHint,
    destructive: tool.annotations.destructiveHint,
  }));

export const automationRoutes = (context: ServerContext, tools: ToolHub) =>
  ({
    listAutomations: bound(E.listAutomations, () => context.store.automations.list()),
    listAutomationTools: bound(E.listAutomationTools, () => toolRows(tools)),
    createAutomation: bound(E.createAutomation, ({ body, caller }) => {
      checkedDefinition(context, tools, caller, { definition: body.definition });
      return authorSpeechAutomation(context.store, caller, {
        definition: body.definition,
        save: () =>
          context.store.automations.create({
            ...body,
            origin: authoredOrigin(tools, caller, body.definition),
            author: authorOf(context.store, caller),
          }),
      });
    }),
    updateAutomation: bound(E.updateAutomation, ({ params, body, caller }) => {
      const id = params.automationId;
      if (body.definition !== undefined)
        checkedDefinition(context, tools, caller, { definition: body.definition, id });
      return authorSpeechAutomation(context.store, caller, {
        definition: body.definition ?? definitionOf(context.store.automations.byId(id)),
        save: () => context.store.automations.update(id, savedChange(tools, caller, body)),
        id,
      });
    }),
    removeAutomation: bound(E.removeAutomation, ({ params }) => {
      context.store.automations.remove(params.automationId);
      return DONE_REPLY;
    }),
    ...runRoutes(context, tools),
    ...clientRoutes(context.store),
  }) as const;
