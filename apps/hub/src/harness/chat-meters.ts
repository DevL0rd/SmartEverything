import {
  harnessContextPercent,
  type AiHarnessEvent,
  type AiHarnessSession,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { HostStore } from '../store/host/host-store';

const log = new Logger('hub.chat-meters');

type Measured = NonNullable<AiHarnessSession['context']>;

function warnUnmeasurable(chatId: string, context: Measured): void {
  log.warn('context.unmeasurable', {
    chatId,
    provider: context.provider ?? null,
    model: context.model ?? null,
    capacityTokens: context.capacity_tokens,
    inputTokens: context.input_tokens,
    state: context.state,
  });
}

export function noteChatMeters(store: HostStore, event: AiHarnessEvent): void {
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
  if (percent === null && event.context_update === 'measured')
    warnUnmeasurable(event.chat_id, event.session.context);
  store.aiChats.noteContext(event.chat_id, percent === null ? null : Math.round(percent));
}
