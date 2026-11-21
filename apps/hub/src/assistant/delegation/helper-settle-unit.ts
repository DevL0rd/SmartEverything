import {
  assistantLabel,
  helperDialogueOf,
  messageQuoteOf,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import { durableStoreUnit, storeUnit } from '../../store/host/unit';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { HostStore } from '../../store/host/host-store';
import { HUB_RESTARTED } from '../interruption';
import { responderMessage } from '../conversation-log';
import { interruptionCode } from '../interruption';
import { applyReplyOp } from '../reply-records';
import { addConversationMessage } from '../store-units';

export interface HelperSettlement {
  readonly parentMessageId: string;
  readonly eventId: string;
  readonly text: string;
  readonly ok: boolean;
  readonly relayed: boolean;
}

function settle(store: HostStore, input: HelperSettlement): void {
  const row = store.assistantChat.find(input.parentMessageId);
  const dialogue = row === undefined ? undefined : helperDialogueOf(row);
  if (row === undefined || dialogue?.direction !== 'to_helper' || row.state !== null) return;
  if (!input.ok) {
    applyReplyOp(store, {
      kind: 'failedMessage',
      messageId: row.id,
      reason: input.text,
      code: interruptionCode(input.text) ?? 'unknown',
    });
    return;
  }
  if (input.text.trim() !== '' && !input.relayed) {
    addConversationMessage(store, {
      row: responderMessage(
        {
          chat: store.aiChats.chat(row.chat_id),
          replyTo: null,
          text: input.text,
          helperDialogue: { ...dialogue, direction: 'from_helper' },
          quote: messageQuoteOf(row),
        },
        () => assistantLabel(store.assistantChat.settings()),
      ),
      files: [],
      messageId: input.eventId,
    });
  }
  applyReplyOp(store, { kind: 'state', messageId: row.id, state: 'answered', reason: null });
}

export interface ReconciledHelper {
  readonly event: StoredEvent;
  readonly text: string;
  readonly ok: boolean;
}

function restoreAnsweredHelperMessage(
  store: HostStore,
  message: AssistantMessageRow | undefined,
): AssistantMessageRow | undefined {
  if (message === undefined) return undefined;
  const reply = store.assistantChat
    .repliesTo(message.id)
    .findLast((row) => row.state === 'answered');
  if (reply !== undefined && message.state !== 'answered')
    store.assistantChat.updateMessage(message.id, {
      state: 'answered',
      reason: null,
      reason_code: null,
    });
  return reply;
}

function reconcileOne(store: HostStore, event: StoredEvent): ReconciledHelper {
  const message =
    event.message_id === null ? undefined : store.assistantChat.find(event.message_id);
  store.assistantEvents.mark(event.id, 'answered_at');
  const reply = restoreAnsweredHelperMessage(store, message);
  if (reply !== undefined || message?.state === 'answered')
    return { event, text: reply?.text ?? '', ok: true };
  return { event, text: message?.reason ?? HUB_RESTARTED, ok: false };
}

function reconcile(store: HostStore, _input: null): readonly ReconciledHelper[] {
  return store.assistantEvents
    .settledHelperEvents()
    .filter((event) => store.harnessDeliveries.find(event.id)?.state !== 'admitted')
    .map((event) => reconcileOne(store, event));
}

export const HELPER_SETTLE_UNIT = storeUnit(settle);
export const HELPER_RECONCILE_UNIT = durableStoreUnit(reconcile);
