import type { QueryClient } from '@tanstack/react-query';
import type { LiveMessage, CodexProviderEvent } from '@smarteverything/domain';
import {
  codexProviderKey,
  withCodexProviderEvent,
  type CodexChatProvider,
} from './codex-provider-events';

const live = new WeakMap<QueryClient, CodexProviderNotices>();
export function mergeCodexProviderSnapshot(
  client: QueryClient,
  chatId: string,
  state: CodexChatProvider,
): CodexChatProvider {
  return live.get(client)?.merge(chatId, state) ?? state;
}
export class CodexProviderNotices {
  private readonly notices = new Map<string, readonly CodexProviderEvent[]>();
  constructor(private readonly client: QueryClient) {}
  start(): void {
    live.set(this.client, this);
  }
  clear(): void {
    this.notices.clear();
  }
  stop(): void {
    this.clear();
    live.delete(this.client);
  }
  receive(message: Extract<LiveMessage, { readonly type: 'ai_chat_runtime_provider' }>): void {
    const previous = this.notices.get(message.chat_id) ?? [];
    if (previous.some((event) => event.job_id === message.job_id && event.seq >= message.event.seq))
      return;
    this.notices.set(message.chat_id, [...previous, message.event].slice(-200));
    const key = codexProviderKey(message.chat_id);
    const state = this.client.getQueryData<CodexChatProvider>(key);
    if (state?.job_id !== message.job_id) {
      void this.client.invalidateQueries({ queryKey: key });
      return;
    }
    const sequence = state.events.reduce((seq, event) => Math.max(seq, event.seq), 0);
    this.client.setQueryData(key, withCodexProviderEvent(state, message.event));
    if (
      message.event.seq > sequence + 1 ||
      message.event.kind === 'accepted' ||
      message.event.kind === 'usage'
    )
      void this.client.invalidateQueries({ queryKey: key });
  }
  merge(chatId: string, state: CodexChatProvider): CodexChatProvider {
    return (this.notices.get(chatId) ?? []).reduce(withCodexProviderEvent, state);
  }
}
