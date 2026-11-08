import { randomUUID } from 'node:crypto';
import { ApiError, type AiChatRow, type HarnessRuntimeReceipt } from '@smarteverything/domain';
import { effectiveClientById } from '../../../server/person-access';
import type { HarnessService } from '../../../harness/service';
import { OwnEngineSelections } from '../../../harness/own-selection';
import { openConversation } from '../../../harness/opening';
import { sessionAttached } from '../../../harness/attach';
import { currentControlCaller } from '../../../server/local-control-context';
import { controlFailed, controlFinished, controlRefused, controlSent } from './runner-trace';

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

export async function nativeControl(
  service: HarnessService,
  chat: AiChatRow,
  request:
    { readonly kind: 'interrupt' | 'compact' } | { readonly kind: 'steer'; readonly text: string },
): Promise<HarnessRuntimeReceipt> {
  const { kind } = request;
  const startedAt = performance.now();
  const admitted = await ensureNativeControlSession(service, chat);
  const state = service.state({ profileId: admitted.profile_id, role: 'member' }, admitted.id);
  if (state.epoch === null) {
    controlRefused(chat.id, kind);
    throw new ApiError('conflict', 'Native writer authority is unavailable.');
  }
  controlSent(chat.id, kind, state.session_id, state.epoch);
  try {
    const receipt = await service.directory.execute(state.target, randomUUID(), {
      ...request,
      session_id: state.session_id,
      expected_epoch: state.epoch,
    });
    controlFinished(chat.id, kind, startedAt);
    return receipt;
  } catch (cause) {
    controlFailed(chat.id, kind, cause, startedAt);
    throw cause;
  }
}
