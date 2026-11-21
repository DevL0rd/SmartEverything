import { background } from '@smarteverything/logging';
import { ApiError, type AiChatRow, type AiHarnessEvent } from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { HarnessService } from '../../../harness/service';
import { admitExecutionTarget, eventAuthority, withExecutionAuthority } from '../../turn-authority';
import type { NativeInputHistory } from '@smarteverything/harness';
import type { ConversationProjector } from './projector';
import { nativeReplyId, reconcileNativeReplies } from './projector-replay';

async function restoreTurns(
  turns: ConversationProjector,
  pendingInput: (input: NativeInputHistory) => readonly string[],
): Promise<void> {
  const { store } = turns.options.service;
  await reconcileNativeReplies(turns, pendingInput);
  for (const delivery of await store.host.call('harnessDeliveries', 'pending')) {
    const event = await store.host.call('assistantEvents', 'event', delivery.delivery_id);
    const chat = await store.host.call('aiChats', 'chat', event.chat_id);
    background(turns.start(event, chat, nativeReplyId(delivery), true), 'turns.start_failed');
  }
}

export function restoredTurns(
  turns: ConversationProjector,
  pendingInput: (input: NativeInputHistory) => readonly string[],
): Promise<void> {
  const early: AiHarnessEvent[] = [];
  let restoring = true;
  turns.options.service.onEvent(async (event): Promise<void> => {
    if (!restoring) {
      await turns.received(event);
      return;
    }
    early.push(event);
  });
  const restored = restoreTurns(turns, pendingInput).finally(async () => {
    for (let event = early.shift(); event !== undefined; event = early.shift())
      await turns.received(event);
    restoring = false;
  });
  background(restored, 'turns.restore_failed');
  return restored;
}

export async function admitRestoredInput(service: HarnessService, chat: AiChatRow): Promise<void> {
  const binding = service.binding(chat);
  const { store } = service;
  const pending: StoredEvent[] = [];
  for (const delivery of await store.host.call(
    'harnessDeliveries',
    'pending',
    binding.session_id ?? undefined,
  )) {
    const event = await store.host.call('assistantEvents', 'event', delivery.delivery_id);
    if (event.chat_id === chat.id) pending.push(event);
  }
  if (pending.length === 0) return;
  const connection = service.directory.get(binding.execution_target);
  if (connection.host.manifest?.delivery_correlation !== true)
    throw new ApiError(
      'conflict',
      'This execution host must support native delivery correlation before restoring pending conversation input.',
    );
  for (const event of pending) {
    const authority = await withExecutionAuthority(undefined, () => eventAuthority(store, event));
    admitExecutionTarget(store, chat, authority);
  }
}
