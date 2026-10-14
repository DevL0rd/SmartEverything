import type { QueryClient } from '@tanstack/react-query';
import type { AiChatProvider, AiChatProviderNotice, ProviderEvent } from '@smarteverything/domain';
import { providerKey } from './keys';
import { providerSequence, withProviderEvent } from './provider-events';

const REFRESH_DELAY_MS = 100;
const KEPT_NOTICES = 200;
const liveProviders = new WeakMap<QueryClient, ProviderNotices>();

function isTaskNotice(event: ProviderEvent): boolean {
  if (event.kind !== 'runtime') return false;
  const subtype = event.payload['subtype'];
  return (
    event.type.startsWith('task_') ||
    (typeof subtype === 'string' &&
      (subtype.startsWith('task_') || subtype === 'background_tasks_changed'))
  );
}

function needsSnapshot(event: ProviderEvent): boolean {
  return (
    event.kind === 'accepted' || (event.kind === 'runtime' && event.type === 'rate_limit_event')
  );
}

function stateKey(chatId: string): readonly string[] {
  return [...providerKey(chatId), 'state'];
}

export function mergeProviderSnapshot(
  client: QueryClient,
  chatId: string,
  state: AiChatProvider,
): AiChatProvider {
  return liveProviders.get(client)?.merge(chatId, state) ?? state;
}

export class ProviderNotices {
  private readonly notices = new Map<string, readonly ProviderEvent[]>();
  private readonly snapshots = new Set<string>();
  private readonly reads = new Set<string>();
  private readonly refreshing = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly client: QueryClient) {}

  start(): void {
    liveProviders.set(this.client, this);
  }

  receive(message: AiChatProviderNotice): void {
    const { chat_id: chatId, event } = message;
    const previous = this.notices.get(chatId) ?? [];
    if (previous.some((item) => item.job_id === event.job_id && item.seq >= event.seq)) return;
    this.notices.set(chatId, [...previous, event].slice(-KEPT_NOTICES));
    const state = this.client.getQueryData<AiChatProvider>(stateKey(chatId));
    if (state?.job_id !== event.job_id) this.snapshots.add(chatId);
    else {
      const sequence = providerSequence(state, event.job_id);
      if (sequence > 0 && event.seq > sequence + 1) this.snapshots.add(chatId);
      this.client.setQueryData(stateKey(chatId), withProviderEvent(state, event));
    }
    if (needsSnapshot(event)) this.snapshots.add(chatId);
    if (isTaskNotice(event)) this.reads.add(chatId);
    this.schedule();
  }

  merge(chatId: string, state: AiChatProvider): AiChatProvider {
    return (this.notices.get(chatId) ?? []).reduce(withProviderEvent, state);
  }

  private schedule(): void {
    if (this.timer !== null || (this.snapshots.size === 0 && this.reads.size === 0)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.refresh();
    }, REFRESH_DELAY_MS);
  }

  private refresh(): void {
    for (const chatId of this.snapshots) this.refreshSnapshot(chatId);
    for (const chatId of this.reads)
      void this.client.invalidateQueries({ queryKey: [...providerKey(chatId), 'read'] });
    this.snapshots.clear();
    this.reads.clear();
  }

  private refreshSnapshot(chatId: string): void {
    if (this.refreshing.has(chatId)) return;
    this.refreshing.add(chatId);
    void this.client.invalidateQueries({ queryKey: stateKey(chatId), exact: true }).finally(() => {
      this.refreshing.delete(chatId);
    });
  }

  clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.notices.clear();
    this.snapshots.clear();
    this.reads.clear();
  }

  stop(): void {
    this.clear();
    liveProviders.delete(this.client);
  }
}
