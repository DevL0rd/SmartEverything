import { background } from '@smarteverything/logging';
import type { AiHarnessEvent } from '@smarteverything/domain';
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
  turns.options.service.onEvent((event) => {
    if (restoring) early.push(event);
    else turns.received(event);
  });
  const restored = restoreTurns(turns, pendingInput).finally(() => {
    restoring = false;
    for (const event of early.splice(0)) turns.received(event);
  });
  background(restored, 'turns.restore_failed');
  return restored;
}
