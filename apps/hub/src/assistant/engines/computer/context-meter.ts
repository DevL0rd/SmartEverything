import type { AiChatRow } from '@smarteverything/domain';
import type { Store } from '../../../store/store';
import type { ComputerEvent } from './provider-state';

export function contextPercentOf(event: ComputerEvent): number | null {
  if (event.kind !== 'usage' || !('context_percent' in event) || event.context_percent === null)
    return null;
  return Math.round(event.context_percent);
}

export function noteContext(store: Store, chat: AiChatRow, event: ComputerEvent): void {
  const percent = contextPercentOf(event);
  if (percent !== null) store.aiChats.noteContext(chat.id, percent);
}
