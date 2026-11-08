import { z } from 'zod';
import { ApiError } from '@smarteverything/domain';
import type { AiModelRouteSelection, DshSessionEvent } from '@smarteverything/domain';
import { SUBAGENT_MODEL_POLICY_EVENT, type SubagentModelRoute } from '@smarteverything/harness';
import { assertModelAllowed, modelAllowed } from '../server/person-scope';
import type { HarnessGrant } from './grant';
import type { HarnessService } from './service';

const DESCRIPTOR = z.object({
  type: z.literal('subagent/descriptor'),
  data: z.object({
    agentProvider: z.string().min(1),
    agentModel: z.string().min(1),
    agentReasoningEffort: z.string().min(1).optional(),
  }),
});

type ChildChoice = z.infer<typeof DESCRIPTOR>['data'];

export function childModelRoutes(service: HarnessService, profileId: string): SubagentModelRoute[] {
  return service.routes
    .list(profileId)
    .filter((route) => route.state === 'ready')
    .flatMap((route) =>
      route.models
        .filter((model) => modelAllowed(service.store, profileId, model.id))
        .map((model) => ({ provider: route.id, model: model.id }))
        .toSorted((left, right) => Number(alias(right.model)) - Number(alias(left.model))),
    );
}

function alias(model: string): boolean {
  return model.startsWith('~');
}

export function hasModelPolicy(events: readonly { readonly type: string }[]): boolean {
  return events.some((event) => event.type === SUBAGENT_MODEL_POLICY_EVENT);
}

export function modelPolicyEvents(
  service: HarnessService,
  profileId: string,
  seq: number,
): DshSessionEvent[] {
  const routes = childModelRoutes(service, profileId);
  if (routes.length === 0) return [];
  return [
    {
      type: SUBAGENT_MODEL_POLICY_EVENT,
      seq,
      time: Date.now(),
      data: { allowedModels: routes.map(({ provider, model }) => ({ provider, model })) },
    },
  ];
}

function unchanged(grant: HarnessGrant, choice: ChildChoice): boolean {
  return (
    grant.route.route_id === choice.agentProvider &&
    grant.route.model === choice.agentModel &&
    (choice.agentReasoningEffort === undefined ||
      choice.agentReasoningEffort === grant.route.effort)
  );
}

function chosenRoute(
  service: HarnessService,
  grant: HarnessGrant,
  choice: ChildChoice,
): AiModelRouteSelection {
  const route = service.routes
    .list(grant.profile_id)
    .find((entry) => entry.id === choice.agentProvider);
  if (route === undefined)
    throw new ApiError(
      'forbidden',
      'That model route is not one this person may use. Pick a route from list_subagent_models.',
    );
  if (route.state !== 'ready') throw new ApiError('conflict', route.failure.message);
  const model = route.models.find((entry) => entry.id === choice.agentModel);
  if (model === undefined)
    throw new ApiError(
      'forbidden',
      `The model ${choice.agentModel} is not offered on that route. Pick a model from list_subagent_models.`,
    );
  assertModelAllowed(service.store, grant.profile_id, model.id);
  const effort = choice.agentReasoningEffort ?? null;
  if (effort !== null && !model.capabilities.efforts.includes(effort))
    throw new ApiError('invalid_request', `The model ${model.id} has no ${effort} effort.`);
  const selection: AiModelRouteSelection = {
    route_id: route.id,
    ...(route.credential_generation === undefined
      ? {}
      : { credential_generation: route.credential_generation }),
    capability_revision: route.capability_revision,
    model: model.id,
    effort,
  };
  service.routes.selected(grant.profile_id, selection, grant.authority.kind === 'trigger');
  return selection;
}

function bindChildRoute(service: HarnessService, sessionId: string, choice: ChildChoice): void {
  const { store } = service;
  const grant = store.harnessSessions.grant(sessionId);
  if (grant === undefined || unchanged(grant, choice)) return;
  const route = chosenRoute(service, grant, choice);
  store.harnessSessions.issue({ ...grant, route });
  const run = store.aiAgentRuns.currentOfSession(sessionId);
  const chatId = run?.child_chat_id ?? null;
  if (run === undefined || chatId === null) return;
  const chat = store.aiChats.chat(chatId);
  if (chat.engine.kind !== 'dsh') return;
  store.aiChats.update(chat.id, {
    engine: {
      ...chat.engine,
      model_route_id: route.route_id,
      model: route.model,
      effort: route.effort,
    },
  });
  store.aiAgentRuns.upsert({
    ...run,
    model: route.model,
    effort: route.effort,
    source_seq: run.source_seq + 1,
    ...(run.harness === undefined
      ? {}
      : { harness: { ...run.harness, model_route_id: route.route_id } }),
  });
}

export function admitChildRoutes(service: HarnessService): void {
  service.store.dshSessions.admitAppend((sessionId, events) => {
    for (const event of events) {
      const descriptor = DESCRIPTOR.safeParse(event);
      if (descriptor.success) bindChildRoute(service, sessionId, descriptor.data.data);
    }
  });
}
