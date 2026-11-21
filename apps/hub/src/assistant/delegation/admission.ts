import { ApiError, type AiAgentLoopSettings, type AiChatRow } from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import { Logger } from '@smarteverything/logging';

const log = new Logger('hub.assistant-delegation');

export interface ChatLineage {
  readonly chat: AiChatRow;
  readonly depth: number;
  readonly root: string;
}

function lineage(store: HostStore, chatId: string): ChatLineage {
  const chat = store.aiChats.chat(chatId);
  let depth = 0;
  let cursor = chat;
  while (cursor.kind === 'subagent' && cursor.parent_id !== null) {
    depth += 1;
    cursor = store.aiChats.chat(cursor.parent_id);
  }
  return { chat, depth, root: cursor.id };
}

export const CHAT_LINEAGE_UNIT = storeUnit(lineage);

export class SubagentAdmission {
  private readonly active = new Set<string>();
  private lastRoot: string | null = null;

  constructor(private readonly store: Store) {}

  async preflight(parent: AiChatRow, wait: boolean): Promise<void> {
    const { max_depth: subagentDepth, max_active: subagentActive } = this.limits();
    if (
      subagentDepth !== undefined &&
      (await this.store.host.read('assistantChatLineage', parent.id)).depth >= subagentDepth
    )
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
    return this.store.live.home.assistant.read().agent_loops.subagents;
  }

  private refuse(parent: AiChatRow, reason: string, message: string): never {
    log.warn('subagent.refused', { reason, parentId: parent.id, active: this.active.size });
    throw new ApiError('conflict', message);
  }

  async enter(event: StoredEvent): Promise<boolean> {
    const { host } = this.store;
    const { chat, root } = await host.read('assistantChatLineage', event.chat_id);
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
    const roots = [...new Set(await host.call('assistantEvents', 'pendingSubagentRoots'))];
    const next = roots.find((candidate) => candidate !== this.lastRoot) ?? roots[0];
    if (next !== undefined && root !== next) {
      log.debug('subagent.deferred_for_fairness', {
        eventId: event.id,
        chatId: chat.id,
        nextRoot: next,
      });
      return false;
    }
    this.active.add(event.id);
    this.lastRoot = root;
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
}
