import { API_ENDPOINTS } from '@smarteverything/domain';
import { bound, DONE_REPLY } from '../server/router';
import { profileIdOf, roleOfCaller } from '../server/auth';
import type { Caller } from '../server/auth';
import type { MemoryPrincipal } from './principal';
import type { MemoryService } from './service';

function principalOf(caller: Caller): MemoryPrincipal {
  return {
    profileId: profileIdOf(caller),
    role: roleOfCaller(caller),
    chatId: null,
    messageId: null,
  };
}

export const memoryRoutes = (service: MemoryService) =>
  ({
    listAiMemories: bound(API_ENDPOINTS.listAiMemories, ({ caller }) =>
      service.list(principalOf(caller)),
    ),
    addAiMemory: bound(
      API_ENDPOINTS.addAiMemory,
      async ({ caller, body }) => (await service.add(principalOf(caller), body)).memory,
    ),
    changeAiMemory: bound(
      API_ENDPOINTS.changeAiMemory,
      async ({ caller, params, body }) =>
        (await service.change(principalOf(caller), params.memoryId, body)).memory,
    ),
    removeAiMemory: bound(API_ENDPOINTS.removeAiMemory, async ({ caller, params }) => {
      await service.remove(principalOf(caller), params.memoryId);
      return DONE_REPLY;
    }),
    forgetAiMemories: bound(API_ENDPOINTS.forgetAiMemories, async ({ caller, query }) => ({
      removed: await service.forget(principalOf(caller), query.scope),
    })),
    changeAiMemorySettings: bound(API_ENDPOINTS.changeAiMemorySettings, ({ caller, body }) =>
      service.changeSettings(principalOf(caller), body),
    ),
  }) as const;
