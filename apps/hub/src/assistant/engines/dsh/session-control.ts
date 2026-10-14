import { prepareHostConfiguration } from '../../../harness/configuration-preparation';
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
  prepareConfiguration = true,
): Promise<AiChatRow> {
  const caller = currentControlCaller();
  const clientId = controlClientId(service, original, caller);
  if (original.engine.kind === 'openrouter')
    new OwnEngineSelections(service).migrate(
      original.id,
      caller === undefined,
      clientId ?? undefined,
    );
  const chat = service.store.aiChats.chat(original.id);
  const binding = service.binding(chat);
  if (prepareConfiguration) await prepareConfigurationForChat(service, chat);
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

async function prepareConfigurationForChat(
  service: HarnessService,
  chat: AiChatRow,
): Promise<void> {
  if (service.binding(chat).session_id === null) return;
  await prepareHostConfiguration(
    service,
    service.state({ profileId: chat.profile_id, role: 'member' }, chat.id),
  );
}
