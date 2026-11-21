import type { AiChatRow } from '@smarteverything/domain';
import type { Store } from '../../../store/store';
import type { ComputerEvent } from './provider-state';

export function contextPercentOf(event: ComputerEvent): number | null {
  if (event.kind !== 'usage' || typeof event.context_percent !== 'number') return null;
  return Math.round(event.context_percent);
}

export async function noteContext(
  store: Pick<Store, 'host'>,
  chat: AiChatRow,
  event: ComputerEvent,
): Promise<void> {
  const percent = contextPercentOf(event);
  if (percent !== null) await store.host.call('aiChats', 'noteContext', chat.id, percent);
}
