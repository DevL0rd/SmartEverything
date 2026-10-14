import { ApiError, type AiChatRow } from '@smarteverything/domain';
import type { HarnessDispatcher } from '@smarteverything/harness/process';
import type { HarnessService } from '../../../harness/service';
import { OwnEngineSelections } from '../../../harness/own-selection';
import { openConversation } from '../../../harness/opening';
import { currentControlCaller } from '../../../server/local-control-context';
import { nativeSessionReusable } from './host-lifecycle';

export async function ensureNativeControlSession(
  service: HarnessService,
  dispatcher: HarnessDispatcher,
  original: AiChatRow,
): Promise<AiChatRow> {
  const caller = currentControlCaller();
  const stored = service.store.assistantChat
    .since(original.id, null)
    .toReversed()
    .find((row) => row.client_id !== null);
  const clientId = caller?.kind === 'client' ? caller.client.id : stored?.client_id;
  if (original.engine.kind === 'openrouter')
    new OwnEngineSelections(service).migrate(
      original.id,
      caller === undefined,
      clientId ?? undefined,
    );
  const chat = service.store.aiChats.chat(original.id);
  const binding = service.binding(chat);
  if (nativeSessionReusable(service, dispatcher, binding.session_id, chat.profile_id)) return chat;
  if (clientId === undefined || clientId === null)
    throw new ApiError(
      'conflict',
      'This native maintenance request has no recorded initiating app authority.',
    );
  const client = service.store.clients.byId(clientId);
  if (service.store.profiles.activeOf(clientId).id !== chat.profile_id)
    throw new ApiError(
      'forbidden',
      'The initiating app no longer has this conversation profile active.',
    );
  await openConversation(service, {
    owner: { profileId: chat.profile_id, role: client.role },
    chatId: chat.id,
    authority: { kind: 'manual', profileId: chat.profile_id },
    clientId,
  });
  return service.store.aiChats.chat(chat.id);
}
