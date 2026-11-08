import { helperDialogueOf } from '@smarteverything/domain';
import { HELPER_RELAY_RECEIPT, HELPER_RELAY_RECEIPT_DATA } from '@smarteverything/harness/process';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { Store } from '../../../store/store';

export function helperReplyWasRelayed(
  store: Store,
  event: StoredEvent,
  parentChatId: string,
): boolean {
  const delivery = store.harnessDeliveries.find(event.id);
  if (delivery === undefined) return false;
  const session = store.dshSessions.stat(delivery.session_id, event.profile_id);
  if (session?.header.parentSession === undefined) return false;
  const { parentSession } = session.header;
  return store.dshSessions
    .readAll(delivery.session_id, event.profile_id, {
      offset: delivery.start_seq ?? session.inherited_event_count,
    })
    .some((record) => {
      if (record.type !== HELPER_RELAY_RECEIPT) return false;
      const receipt = HELPER_RELAY_RECEIPT_DATA.safeParse(record.data);
      if (
        !receipt.success ||
        receipt.data.deliveryId !== event.id ||
        receipt.data.parentSessionId !== parentSession
      )
        return false;
      const row = store.assistantChat.find(receipt.data.messageId);
      if (row?.chat_id !== parentChatId) return false;
      const dialogue = helperDialogueOf(row);
      return dialogue?.direction === 'from_helper' && dialogue.helper_chat_id === event.chat_id;
    });
}
