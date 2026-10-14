import type { QueryClient } from '@tanstack/react-query';
import type { AiHarnessNotice } from '@smarteverything/domain';
import {
  EXTENSIONS_KEY,
  EXTENSION_CONFIGURATION_KEY,
  DISCOVERY_KEY,
  SKILL_UPDATES_KEY,
} from './extension-keys';
import { AGENT_RUN_PREFIX, AI_MODELS_PREFIX } from './keys';

const REFERENCE_QUERY_PREFIX = ['window', 'ai-references'] as const;

const COMMAND_QUERY_PREFIX = ['window', 'ai-harness-commands'] as const;

export const HARNESS_CATALOGUE_KEY = ['window', 'ai-harness'] as const;
export const HARNESS_SESSION_PREFIX = ['window', 'ai-harness-session'] as const;
const live = new WeakMap<QueryClient, HarnessNotices>();

export function harnessReadRevision(client: QueryClient, chatId: string): string {
  return live.get(client)?.readRevision(chatId) ?? 'unwatched';
}
export function harnessKey(chatId: string): readonly string[] {
  return [...HARNESS_SESSION_PREFIX, chatId];
}
export class HarnessNotices {
  private readonly pending = new Map<string, readonly string[]>();
  private readonly refreshing = new Set<string>();
  private readonly noticeRevisions = new Map<string, number>();
  private readGeneration = 0;
  private revision = 0;
  private active = false;
  private queued = false;
  constructor(private readonly client: QueryClient) {}
  start(): void {
    this.active = true;
    live.set(this.client, this);
  }
  readRevision(chatId: string): string {
    return JSON.stringify([this.readGeneration, this.noticeRevisions.get(chatId) ?? 0]);
  }
  synchronized(): void {
    if (!this.active) return;
    this.configurationChanged();
    this.enqueue(HARNESS_SESSION_PREFIX);
    this.enqueue(['window', 'ai-provider']);
  }
  configurationChanged(): void {
    if (!this.active) return;
    this.readGeneration += 1;
    this.enqueue(EXTENSION_CONFIGURATION_KEY);
    this.enqueue(EXTENSIONS_KEY);
    this.enqueue(SKILL_UPDATES_KEY);
    this.enqueue(DISCOVERY_KEY);
    this.enqueue(COMMAND_QUERY_PREFIX);
    this.enqueue(REFERENCE_QUERY_PREFIX);
    this.enqueue(HARNESS_CATALOGUE_KEY);
    this.enqueue(AI_MODELS_PREFIX);
  }
  receive(message: AiHarnessNotice): void {
    if (!this.active) return;
    const event = message.event;
    if (event.kind === 'text' || event.kind === 'reasoning' || event.kind === 'tool') return;
    this.noticeRevisions.set(event.chat_id, (this.noticeRevisions.get(event.chat_id) ?? 0) + 1);
    this.enqueue(harnessKey(event.chat_id));
    this.enqueue(COMMAND_QUERY_PREFIX);
    this.enqueue(REFERENCE_QUERY_PREFIX);
    if (event.kind === 'usage' || event.kind === 'state' || event.kind === 'failed')
      this.enqueue(HARNESS_CATALOGUE_KEY);
    if (event.kind === 'agent') this.enqueue([...AGENT_RUN_PREFIX, event.chat_id]);
  }
  private enqueue(key: readonly string[]): void {
    this.pending.set(JSON.stringify(key), key);
    this.schedule();
  }
  private schedule(): void {
    if (this.queued) return;
    this.queued = true;
    const revision = this.revision;
    queueMicrotask(() => {
      if (!this.active || this.revision !== revision) return;
      this.queued = false;
      this.flush();
    });
  }
  private flush(): void {
    for (const [id, key] of this.pending) {
      if (this.refreshing.has(id)) continue;
      this.pending.delete(id);
      this.refreshing.add(id);
      const revision = this.revision;
      void this.client
        .invalidateQueries({ queryKey: key }, { cancelRefetch: false })
        .finally(() => {
          if (!this.active || this.revision !== revision) return;
          this.refreshing.delete(id);
          if (this.pending.size > 0) this.schedule();
        });
    }
  }
  clear(): void {
    this.revision += 1;
    this.readGeneration += 1;
    this.noticeRevisions.clear();
    this.queued = false;
    this.pending.clear();
    this.refreshing.clear();
  }
  stop(): void {
    this.active = false;
    live.delete(this.client);
    this.clear();
    void this.client.cancelQueries({ queryKey: EXTENSION_CONFIGURATION_KEY });
    void this.client.cancelQueries({ queryKey: EXTENSIONS_KEY });
    void this.client.cancelQueries({ queryKey: SKILL_UPDATES_KEY });
    void this.client.cancelQueries({ queryKey: DISCOVERY_KEY });
    void this.client.cancelQueries({ queryKey: HARNESS_CATALOGUE_KEY });
    void this.client.cancelQueries({ queryKey: HARNESS_SESSION_PREFIX });
    void this.client.cancelQueries({ queryKey: COMMAND_QUERY_PREFIX });
    void this.client.cancelQueries({ queryKey: REFERENCE_QUERY_PREFIX });
  }
}
