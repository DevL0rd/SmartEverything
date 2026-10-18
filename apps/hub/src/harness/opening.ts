import { randomUUID } from 'node:crypto';
import type { ChatOwner } from '../assistant/chat-directory';
import type { HarnessAuthority } from '@smarteverything/harness';
import type { HarnessService } from './service';
import type { HarnessRuntimeRequest } from '@smarteverything/domain';

type OpenRequest = Extract<HarnessRuntimeRequest, { kind: 'open' }>;
const opening = new WeakMap<HarnessService, Map<string, Promise<OpenRequest>>>();

export function openConversation(
  service: HarnessService,
  input: {
    readonly owner: ChatOwner;
    readonly chatId: string;
    readonly authority: HarnessAuthority;
    readonly clientId?: string;
  },
): Promise<OpenRequest> {
  const chats = opening.get(service) ?? new Map<string, Promise<OpenRequest>>();
  opening.set(service, chats);
  const joined = chats.get(input.chatId);
  if (joined !== undefined) return joined;
  const result = Promise.resolve()
    .then(async (): Promise<OpenRequest> => {
      const request = service.prepare(input.owner, input.chatId, input.authority, input.clientId);
      await service.directory.execute(request.claim.target, randomUUID(), request);
      return request;
    })
    .finally(() => {
      chats.delete(input.chatId);
    });
  chats.set(input.chatId, result);
  return result;
}
