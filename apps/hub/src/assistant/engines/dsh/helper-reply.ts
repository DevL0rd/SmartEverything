import { helperDialogueOf } from '@smarteverything/domain';
import { HELPER_RELAY_RECEIPT, HELPER_RELAY_RECEIPT_DATA } from '@smarteverything/harness/process';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { Store } from '../../../store/store';

function relayedMessages(
  records: readonly { readonly type: string; readonly data: unknown }[],
  event: StoredEvent,
  parentSession: string,
): string[] {
  return records.flatMap((record) => {
    if (record.type !== HELPER_RELAY_RECEIPT) return [];
    const receipt = HELPER_RELAY_RECEIPT_DATA.safeParse(record.data);
    return receipt.success &&
      receipt.data.deliveryId === event.id &&
      receipt.data.parentSessionId === parentSession
      ? [receipt.data.messageId]
      : [];
  });
}

async function relayedInParent(
  store: Store,
  messageIds: readonly string[],
  event: StoredEvent,
  parentChatId: string,
): Promise<boolean> {
  for (const messageId of messageIds) {
    const row = await store.host.call('assistantChat', 'find', messageId);
    if (row?.chat_id !== parentChatId) continue;
    const dialogue = helperDialogueOf(row);
    if (dialogue?.direction === 'from_helper' && dialogue.helper_chat_id === event.chat_id)
      return true;
  }
  return false;
}

export async function helperReplyWasRelayed(
  store: Store,
  event: StoredEvent,
  parentChatId: string,
): Promise<boolean> {
  const { host } = store;
  const delivery = await host.call('harnessDeliveries', 'find', event.id);
  if (delivery === undefined) return false;
  const session = await host.call('dshSessions', 'stat', delivery.session_id, event.profile_id);
  if (session?.header.parentSession === undefined) return false;
  const records = await host.call('dshSessions', 'readAll', delivery.session_id, event.profile_id, {
    offset: delivery.start_seq ?? session.inherited_event_count,
  });
  return relayedInParent(
    store,
    relayedMessages(records, event, session.header.parentSession),
    event,
    parentChatId,
  );
}
