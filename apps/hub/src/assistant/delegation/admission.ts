import { ApiError, type AiAgentLoopSettings, type AiChatRow } from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import { Logger } from '@smarteverything/logging';

const log = new Logger('hub.assistant-delegation');

export class SubagentAdmission {
  private readonly active = new Set<string>();
  private lastRoot: string | null = null;

  constructor(private readonly store: Store) {}

  preflight(parent: AiChatRow, wait: boolean): void {
    const { max_depth: subagentDepth, max_active: subagentActive } = this.limits();
    if (subagentDepth !== undefined && this.depth(parent) >= subagentDepth)
      this.refuse(parent, 'depth', 'The subagent nesting depth limit has been reached.');
    if (
      wait &&
      parent.kind === 'subagent' &&
      subagentActive !== undefined &&
      this.active.size >= subagentActive
    )
      this.refuse(
        parent,
        'capacity',
        'Child capacity is full. Queue without waiting so this parent can release its slot.',
      );
  }

  private limits(): AiAgentLoopSettings['subagents'] {
    return this.store.assistantChat.settings().agent_loops.subagents;
  }

  private refuse(parent: AiChatRow, reason: string, message: string): never {
    log.warn('subagent.refused', { reason, parentId: parent.id, active: this.active.size });
    throw new ApiError('conflict', message);
  }

  enter(event: StoredEvent): boolean {
    const chat = this.store.aiChats.chat(event.chat_id);
    if (chat.kind !== 'subagent') return true;
    if (this.active.has(event.id)) return true;
    const { max_active: subagentActive } = this.limits();
    if (subagentActive !== undefined && this.active.size >= subagentActive) {
      log.debug('subagent.deferred', {
        eventId: event.id,
        chatId: chat.id,
        active: this.active.size,
        limit: subagentActive,
      });
      return false;
    }
    const roots = [...new Set(this.store.assistantEvents.pendingSubagentRoots())];
    const next = roots.find((root) => root !== this.lastRoot) ?? roots[0];
    if (next !== undefined && this.root(chat) !== next) {
      log.debug('subagent.deferred_for_fairness', {
        eventId: event.id,
        chatId: chat.id,
        nextRoot: next,
      });
      return false;
    }
    this.active.add(event.id);
    this.lastRoot = this.root(chat);
    log.debug('subagent.admitted', {
      eventId: event.id,
      chatId: chat.id,
      active: this.active.size,
    });
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
