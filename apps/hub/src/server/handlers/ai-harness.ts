import { OwnEngineSelections } from '../../harness/own-selection';
import { readSession } from '../../harness/attach';
import { listMachines, switchMachine } from '../../harness/machines';
import { harnessCommandRoutes } from './ai-harness-commands';
import { openConversation } from '../../harness/opening';
import { API_ENDPOINTS, ApiError, AI_HARNESS_CAPABILITY } from '@smarteverything/domain';
import { bound, DONE_REPLY } from '../router';
import { chatOwnerOf, clientOf, profileIdOf, roleOfCaller } from '../auth';
import type { ChatOwner } from '../../assistant/chat-directory';
import type { Caller } from '../auth';
import type { HarnessService } from '../../harness/service';

export const aiHarnessRoutes = (service: HarnessService) =>
  ({
    controlAiHarnessSubscription: bound(
      API_ENDPOINTS.controlAiHarnessSubscription,
      ({ body, caller }) => service.subscriptions.control(profileIdOf(service.store, caller), body),
    ),
    ...harnessCommandRoutes(service),
    ...configurationRoutes(service),
    ...extensionRoutes(service),
    ...skillUpdateRoutes(service),
    ...chatRoutes(service),
    ...machineRoutes(service),
    ...readRoutes(service),
  }) as const;
const extensionRoutes = (service: HarnessService) =>
  ({
    readAiHarnessExtensions: bound(API_ENDPOINTS.readAiHarnessExtensions, () =>
      service.extensions.catalogue(),
    ),
    resolveAiHarnessSkill: bound(API_ENDPOINTS.resolveAiHarnessSkill, ({ body }) =>
      service.extensions.resolve(body),
    ),
    installAiHarnessExtensions: bound(API_ENDPOINTS.installAiHarnessExtensions, ({ body }) =>
      service.extensions.install(body),
    ),
    changeAiHarnessExtension: bound(API_ENDPOINTS.changeAiHarnessExtension, ({ params, body }) =>
      service.extensions.change(params.id, body),
    ),
    removeAiHarnessExtension: bound(API_ENDPOINTS.removeAiHarnessExtension, async ({ params }) => {
      await service.extensions.remove(params.id);
      return DONE_REPLY;
    }),
    writeAiHarnessSkill: bound(API_ENDPOINTS.writeAiHarnessSkill, ({ params, body }) =>
      service.extensions.write(params.name, body),
    ),
  }) as const;
const skillUpdateRoutes = (service: HarnessService) =>
  ({
    discoverAiHarnessExtensions: bound(API_ENDPOINTS.discoverAiHarnessExtensions, ({ body }) =>
      service.discovery.browse(body),
    ),
    readAiHarnessSkillUpdates: bound(API_ENDPOINTS.readAiHarnessSkillUpdates, () =>
      service.skillUpdates.read(),
    ),
    replaceAiHarnessSkillUpdates: bound(API_ENDPOINTS.replaceAiHarnessSkillUpdates, ({ body }) =>
      service.skillUpdates.replace(body),
    ),
    updateAiHarnessSkills: bound(API_ENDPOINTS.updateAiHarnessSkills, () =>
      service.skillUpdates.update(),
    ),
  }) as const;
const configurationRoutes = (service: HarnessService) =>
  ({
    readAiHarnessConfiguration: bound(API_ENDPOINTS.readAiHarnessConfiguration, ({ caller }) =>
      service.configuration.catalogue(roleOfCaller(caller), clientOf(caller).id),
    ),
  }) as const;
const chatRoutes = (service: HarnessService) =>
  ({
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
      service.switch(ownerOf(service, caller), params.chatId, body),
    ),
    answerAiChatHarness: bound(
      API_ENDPOINTS.answerAiChatHarness,
      async ({ params, body, caller }) => {
        await service.answer(ownerOf(service, caller), params.chatId, body);
        return DONE_REPLY;
      },
    ),
  }) as const;
function readChat(
  service: HarnessService,
  caller: Caller,
  chatId: string,
): ReturnType<HarnessService['state']> | Promise<ReturnType<HarnessService['state']>> {
  const owner = ownerOf(service, caller);
  if (
    caller.kind !== 'client' ||
    caller.via !== undefined ||
    caller.pluginId !== undefined ||
    caller.pluginRequester !== undefined
  )
    return service.state(owner, chatId);
  return readSession(service, { owner, chatId, clientId: caller.client.id });
}

function openChat(
  service: HarnessService,
  caller: Caller,
  chatId: string,
): ReturnType<typeof openConversation> {
  const owner = chatOwnerOf(service.store, caller);
  service.own(owner, chatId);
  new OwnEngineSelections(service).migrate(chatId);
  const authority = { kind: 'manual', profileId: owner.profileId } as const;
  return openConversation(service, { owner, chatId, authority, clientId: clientOf(caller).id });
}

const machineRoutes = (service: HarnessService) =>
  ({
    listAiChatMachines: bound(API_ENDPOINTS.listAiChatMachines, ({ params, caller }) =>
      listMachines(service, ownerOf(service, caller), params.chatId),
    ),
    switchAiChatMachine: bound(API_ENDPOINTS.switchAiChatMachine, ({ params, body, caller }) =>
      switchMachine(service, ownerOf(service, caller), params.chatId, body.machine),
    ),
  }) as const;

const readRoutes = (service: HarnessService) =>
  ({
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
  }) as const;
function ownerOf(service: HarnessService, caller: Caller): ChatOwner {
  return chatOwnerOf(service.store, caller);
}
