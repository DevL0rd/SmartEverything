import { randomUUID } from 'node:crypto';
import {
  AI_HOPS_MAX,
  PLUGIN_ORIGIN,
  type AiChatRow,
  type MessageOrigin,
  type PluginOrigin,
} from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import type { ConversationLog } from '../conversation-log';
import { REPORT_TEXT_MAX, TOO_MANY_HOPS } from './limits';
import { GUARD_AUTHOR, type LoopGuard } from './loop-guard';
import type { Waiters } from './waiters';

export interface ReportBack {
  readonly fromChatId: string;
  readonly toChatId: string;
  readonly text: string;
  readonly ok: boolean;
  readonly hops: number;
  readonly clientId: string | null;
  readonly plugin: PluginOrigin | null;
}

export interface ReportDeps {
  readonly store: Store;
  readonly conversation: ConversationLog;
  readonly guard: LoopGuard;
  readonly waiters: Waiters;
  readonly added: () => void;
}

export function originOf(
  chat: AiChatRow,
  hops: number,
  plugin: PluginOrigin | null = null,
): MessageOrigin {
  const source = chat.kind === 'subagent' ? chat.kind : 'chat';
  return {
    source,
    plugin_id: null,
    device_id: null,
    name: chat.title,
    hops,
    ...(plugin ?? {}),
  };
}

function cut(text: string): string {
  return text.length > REPORT_TEXT_MAX ? `${text.slice(0, REPORT_TEXT_MAX)}… (cut)` : text;
}

export class Reports {
  constructor(private readonly deps: ReportDeps) {}

  finished(event: StoredEvent, text: string, ok: boolean): void {
    const state = ok ? 'answered' : 'failed';
    if (this.deps.waiters.settle(event.id, { state, text })) {
      return;
    }
    if (event.report_to !== null) {
      this.report({
        fromChatId: event.chat_id,
        toChatId: event.report_to,
        text,
        ok,
        hops: event.hops + 1,
        clientId: event.client_id,
        plugin: this.pluginOf(event),
      });
    }
  }

  report(back: ReportBack): void {
    const { store, conversation } = this.deps;
    const from = store.aiChats.chat(back.fromChatId);
    const target = store.aiChats.chat(back.toChatId);
    const { hops } = back;
    const body = back.ok ? cut(back.text) : `It could not finish: ${cut(back.text)}`;
    const row = conversation.note(
      target,
      from.title,
      body,
      originOf(from, Math.min(hops, AI_HOPS_MAX), back.plugin),
    );
    if (hops > AI_HOPS_MAX) {
      conversation.note(target, GUARD_AUTHOR, TOO_MANY_HOPS, null);
      return;
    }
    if (!this.deps.guard.admits(target)) {
      return;
    }
    const eventId = randomUUID();
    store.assistantEvents.add({
      id: eventId,
      kind: 'report',
      chat_id: target.id,
      message_id: row.id,
      profile_id: target.profile_id,
      client_id: back.clientId,
      text: body,
      hops,
    });
    this.deps.added();
  }

  private pluginOf(event: StoredEvent): PluginOrigin | null {
    const origin =
      event.message_id === null
        ? null
        : this.deps.store.assistantChat.message(event.message_id).origin;
    const parsed = PLUGIN_ORIGIN.safeParse({
      plugin_id: origin?.plugin_id,
      requester: origin?.requester,
    });
    return parsed.success ? parsed.data : null;
  }
}
