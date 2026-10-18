import { ApiError, type AiChatRow } from '@smarteverything/domain';
import { effectiveClientById } from '../../../server/person-access';
import type { HarnessService } from '../../../harness/service';
import { OwnEngineSelections } from '../../../harness/own-selection';
import { openConversation } from '../../../harness/opening';
import { sessionAttached } from '../../../harness/attach';
import { currentControlCaller } from '../../../server/local-control-context';

export async function ensureNativeControlSession(
  service: HarnessService,
  original: AiChatRow,
): Promise<AiChatRow> {
  const clientId = controlClientId(service, original, currentControlCaller());
  new OwnEngineSelections(service).migrate(original.id);
  const chat = service.store.aiChats.chat(original.id);
  if (sessionAttached(service, service.binding(chat).session_id, chat.profile_id)) return chat;
  if (clientId === undefined || clientId === null)
    throw new ApiError(
      'conflict',
      'This native maintenance request has no recorded initiating app authority.',
    );
  const client = effectiveClientById(service.store, clientId);
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

function controlClientId(
  service: HarnessService,
  original: AiChatRow,
  caller: ReturnType<typeof currentControlCaller>,
): string | null | undefined {
  if (caller?.kind === 'client') return caller.client.id;
  return service.store.assistantChat
    .since(original.id, null)
    .toReversed()
    .find((row) => row.client_id !== null)?.client_id;
}
