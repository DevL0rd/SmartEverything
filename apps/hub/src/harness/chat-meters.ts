import { harnessContextPercent, type AiHarnessEvent } from '@smarteverything/domain';
import type { Store } from '../store/store';

export function noteChatMeters(store: Store, event: AiHarnessEvent): void {
  if (event.kind === 'usage') {
    if (event.usage.input_tokens !== null)
      store.aiChats.noteCacheReads(
        event.chat_id,
        event.usage.input_tokens,
        event.usage.cache_read_tokens ?? null,
      );
    if (event.context_percent !== null)
      store.aiChats.noteContext(event.chat_id, Math.round(event.context_percent));
    return;
  }
  if (event.kind !== 'state' || event.session.context === undefined) return;
  const percent = harnessContextPercent(event.session.context);
  store.aiChats.noteContext(event.chat_id, percent === null ? null : Math.round(percent));
}
