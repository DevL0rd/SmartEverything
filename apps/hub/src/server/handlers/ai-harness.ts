import { staleHumanSession, stableHumanSession } from '../../harness/stable-session';
import { harnessCommandRoutes } from './ai-harness-commands';
import { openConversation } from '../../harness/opening';
import { API_ENDPOINTS, ApiError, AI_HARNESS_CAPABILITY } from '@smarteverything/domain';
import { bound, DONE_REPLY } from '../router';
import { clientOf, profileIdOf, roleOfCaller } from '../auth';
import type { Caller } from '../auth';
import type { HarnessService } from '../../harness/service';

type HarnessHandlers = Readonly<
  Record<
    keyof typeof API_ENDPOINTS &
      (
        | 'listAiChatHarnessCommands'
        | 'executeAiChatHarnessCommand'
        | 'controlAiHarnessSubscription'
        | 'readAiHarnessConfiguration'
        | 'readAiHarnessExtensions'
        | 'resolveAiHarnessSkill'
        | 'discoverAiHarnessExtensions'
        | 'readAiHarnessSkillUpdates'
        | 'replaceAiHarnessSkillUpdates'
        | 'updateAiHarnessSkills'
        | 'replaceAiHarnessConfiguration'
        | 'readAiHarnessCatalogue'
        | 'openAiChatHarness'
        | 'readAiChatHarness'
        | 'switchAiChatHarness'
        | 'answerAiChatHarness'
        | 'changeAiChatHarnessPermission'
        | 'readDshSession'
        | 'listDshSessions'
        | 'readDshSessionEvents'
      ),
    ReturnType<typeof bound>
  >
>;
export function aiHarnessRoutes(service: HarnessService): HarnessHandlers {
  return {
    controlAiHarnessSubscription: bound(
      API_ENDPOINTS.controlAiHarnessSubscription,
      ({ body, caller }) => service.subscriptions.control(profileIdOf(service.store, caller), body),
    ),
    ...harnessCommandRoutes(service),
    ...configurationRoutes(service),
    ...extensionRoutes(service),
    ...chatRoutes(service),
    ...readRoutes(service),
  };
}
function extensionRoutes(
  service: HarnessService,
): Pick<
  HarnessHandlers,
  | 'readAiHarnessExtensions'
  | 'resolveAiHarnessSkill'
  | 'discoverAiHarnessExtensions'
  | 'readAiHarnessSkillUpdates'
  | 'replaceAiHarnessSkillUpdates'
  | 'updateAiHarnessSkills'
> {
  return {
    discoverAiHarnessExtensions: bound(API_ENDPOINTS.discoverAiHarnessExtensions, ({ body }) =>
      service.discovery.browse(body),
    ),
    readAiHarnessSkillUpdates: bound(API_ENDPOINTS.readAiHarnessSkillUpdates, () =>
      service.skillUpdates.read(),
    ),
    replaceAiHarnessSkillUpdates: bound(
      API_ENDPOINTS.replaceAiHarnessSkillUpdates,
      ({ body, caller }) => service.skillUpdates.replace(body, roleOfCaller(caller)),
    ),
    updateAiHarnessSkills: bound(API_ENDPOINTS.updateAiHarnessSkills, ({ caller }) =>
      service.skillUpdates.update(roleOfCaller(caller)),
    ),
    readAiHarnessExtensions: bound(API_ENDPOINTS.readAiHarnessExtensions, () =>
      service.extensions.catalogue(),
    ),
    resolveAiHarnessSkill: bound(API_ENDPOINTS.resolveAiHarnessSkill, ({ body, caller }) =>
      service.extensions.resolve(body, roleOfCaller(caller)),
    ),
  };
}
function configurationRoutes(
  service: HarnessService,
): Pick<HarnessHandlers, 'readAiHarnessConfiguration' | 'replaceAiHarnessConfiguration'> {
  return {
    readAiHarnessConfiguration: bound(API_ENDPOINTS.readAiHarnessConfiguration, ({ caller }) =>
      service.configuration.catalogue(roleOfCaller(caller), clientOf(caller).id),
    ),
    replaceAiHarnessConfiguration: bound(
      API_ENDPOINTS.replaceAiHarnessConfiguration,
      ({ body, caller }) => service.configuration.replace(body, roleOfCaller(caller)),
    ),
  };
}
function chatRoutes(
  service: HarnessService,
): Pick<
  HarnessHandlers,
  | 'readAiHarnessCatalogue'
  | 'openAiChatHarness'
  | 'readAiChatHarness'
  | 'switchAiChatHarness'
  | 'answerAiChatHarness'
  | 'changeAiChatHarnessPermission'
> {
  return {
    changeAiChatHarnessPermission: bound(
      API_ENDPOINTS.changeAiChatHarnessPermission,
      ({ params, body, caller }) => {
        return service.permission(ownerOf(service, caller), params.chatId, body);
      },
    ),
    readAiHarnessCatalogue: bound(API_ENDPOINTS.readAiHarnessCatalogue, ({ caller }) =>
      API_ENDPOINTS.readAiHarnessCatalogue.response.parse({
        capability: AI_HARNESS_CAPABILITY,
        hosts: service.directory.visible(roleOfCaller(caller), clientOf(caller).id).map((host) => {
          const visible = { ...host };
          delete visible.configuration_sync;
          return visible;
        }),
        routes: service.routes.list(profileIdOf(service.store, caller)),
      }),
    ),
    openAiChatHarness: bound(API_ENDPOINTS.openAiChatHarness, ({ params, caller }) =>
      openChat(service, caller, params.chatId),
    ),
    readAiChatHarness: bound(API_ENDPOINTS.readAiChatHarness, ({ params, caller }) =>
      readChat(service, caller, params.chatId),
    ),
    switchAiChatHarness: bound(API_ENDPOINTS.switchAiChatHarness, ({ params, body, caller }) =>
      switchChat(service, caller, params.chatId, body),
    ),
    answerAiChatHarness: bound(
      API_ENDPOINTS.answerAiChatHarness,
      async ({ params, body, caller }) => {
        await service.answer(ownerOf(service, caller), params.chatId, body);
        return DONE_REPLY;
      },
    ),
  };
}
function readChat(
  service: HarnessService,
  caller: Caller,
  chatId: string,
): ReturnType<HarnessService['state']> | Promise<ReturnType<HarnessService['state']>> {
  const owner = ownerOf(service, caller);
  const session = service.state(owner, chatId);
  if (
    caller.kind !== 'client' ||
    caller.via !== undefined ||
    caller.pluginId !== undefined ||
    caller.pluginRequester !== undefined ||
    session.epoch === null
  )
    return session;
  if (!staleHumanSession(service, session)) return session;
  return stableHumanSession(service, { owner, chatId, clientId: caller.client.id }, session.epoch);
}

function openChat(
  service: HarnessService,
  caller: Caller,
  chatId: string,
): ReturnType<typeof openConversation> {
  const owner = { profileId: profileIdOf(service.store, caller), role: roleOfCaller(caller) };
  const authority = { kind: 'manual', profileId: owner.profileId } as const;
  return openConversation(service, { owner, chatId, authority, clientId: clientOf(caller).id });
}

function readRoutes(
  service: HarnessService,
): Pick<HarnessHandlers, 'readDshSession' | 'listDshSessions' | 'readDshSessionEvents'> {
  return {
    readDshSession: bound(API_ENDPOINTS.readDshSession, ({ params, caller }) => {
      const metadata = service.store.dshSessions.stat(
        params.sessionId,
        profileIdOf(service.store, caller),
      );
      if (metadata === undefined)
        throw new ApiError('not_found', 'This native session does not exist.');
      return metadata;
    }),
    listDshSessions: bound(API_ENDPOINTS.listDshSessions, ({ query, caller }) => {
      const rows = service.store.dshSessions
        .list(profileIdOf(service.store, caller))
        .filter((row) => query.before === undefined || row.header.id < query.before)
        .sort((left, right) => right.header.id.localeCompare(left.header.id));
      const sessions = rows.slice(0, query.limit);
      return {
        sessions,
        next_cursor: rows.length > query.limit ? (sessions.at(-1)?.header.id ?? null) : null,
      };
    }),
    readDshSessionEvents: bound(API_ENDPOINTS.readDshSessionEvents, ({ body, caller }) =>
      service.store.dshSessions.read(body, profileIdOf(service.store, caller)),
    ),
  };
}
function ownerOf(
  service: HarnessService,
  caller: Caller,
): { readonly profileId: string; readonly role: 'owner' | 'member' } {
  return {
    profileId: profileIdOf(service.store, caller),
    role: roleOfCaller(caller),
  };
}

function switchChat(
  service: HarnessService,
  caller: Caller,
  chatId: string,
  body: Parameters<HarnessService['switch']>[2],
): ReturnType<HarnessService['switch']> {
  return service.switch(
    ownerOf(service, caller),
    chatId,
    body,
    caller.kind === 'client' ? caller.client.id : undefined,
  );
}
