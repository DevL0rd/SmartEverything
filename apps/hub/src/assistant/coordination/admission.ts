import { ApiError, type AiChatRow } from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
export const SUBAGENT_ACTIVE_LIMIT = 3;
export const SUBAGENT_QUEUE_LIMIT = 128;
export const SUBAGENT_DEPTH_LIMIT = 4;
export class SubagentAdmission {
  private readonly active = new Set<string>();
  private lastRoot: string | null = null;
  constructor(
    private readonly store: Store,
    readonly limit = SUBAGENT_ACTIVE_LIMIT,
  ) {}
  preflight(parent: AiChatRow, wait: boolean): void {
    if (this.depth(parent) >= SUBAGENT_DEPTH_LIMIT)
      throw new ApiError('conflict', 'The subagent nesting depth limit has been reached.');
    const queued = this.store.assistantEvents
      .pending()
      .filter((event) => this.store.aiChats.chat(event.chat_id).kind === 'subagent').length;
    if (queued >= SUBAGENT_QUEUE_LIMIT)
      throw new ApiError('conflict', 'The bounded subagent queue is full.');
    if (wait && parent.kind === 'subagent' && this.active.size >= this.limit)
      throw new ApiError(
        'conflict',
        'Child capacity is full. Queue without waiting so this parent can release its slot.',
      );
  }
  enter(event: StoredEvent): boolean {
    const chat = this.store.aiChats.chat(event.chat_id);
    if (chat.kind !== 'subagent') return true;
    if (this.active.has(event.id)) return true;
    if (this.active.size >= this.limit) return false;
    const roots = [
      ...new Set(
        this.store.assistantEvents
          .pending()
          .filter((pending) => this.store.aiChats.chat(pending.chat_id).kind === 'subagent')
          .map((pending) => this.root(this.store.aiChats.chat(pending.chat_id))),
      ),
    ];
    const next = roots.find((root) => root !== this.lastRoot) ?? roots[0];
    if (next !== undefined && this.root(chat) !== next) return false;
    this.active.add(event.id);
    this.lastRoot = this.root(chat);
    return true;
  }
  release(eventId: string): void {
    this.active.delete(eventId);
  }
  private depth(chat: AiChatRow): number {
    let count = 0;
    for (
      let cursor = chat;
      cursor.kind === 'subagent' && cursor.parent_id !== null;
      cursor = this.store.aiChats.chat(cursor.parent_id)
    )
      count += 1;
    return count;
  }
  private root(chat: AiChatRow): string {
    let cursor = chat;
    while (cursor.kind === 'subagent' && cursor.parent_id !== null)
      cursor = this.store.aiChats.chat(cursor.parent_id);
    return cursor.id;
  }
}
