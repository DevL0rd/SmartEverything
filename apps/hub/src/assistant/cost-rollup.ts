import type { AiUsageRow } from '@smarteverything/domain';
import type { Store } from '../store/store';

export function costRolledUp(
  store: Pick<Store, 'assistantChat' | 'aiChats'>,
): (row: AiUsageRow, deltaMicros: number) => void {
  return (row, delta): void => {
    if (row.message_id !== null && store.assistantChat.find(row.message_id) !== undefined) {
      store.assistantChat.addCost(row.message_id, delta);
    }
    if (row.chat_id !== null && store.aiChats.find(row.chat_id) !== undefined) {
      store.aiChats.addCost(row.chat_id, delta);
    }
  };
}
