import { z } from 'zod';
import { messageOf } from '@smarteverything/logging';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import { ChatTitles, type ChatTitlesDeps } from './chat-titles';
import { admitsChatExecution } from '../native-helpers';
import { cleanTitle } from './title-text';

const TITLE_EVENT = z.looseObject({
  type: z.literal('session/title'),
  data: z.looseObject({
    title: z.string().min(1),
    source: z.looseObject({ kind: z.string() }),
    historyReplay: z.literal(true).optional(),
  }),
});

function generatedTitle(event: unknown): string | null {
  const parsed = TITLE_EVENT.safeParse(event);
  if (!parsed.success) return null;
  const { data } = parsed.data;
  return data.source.kind === 'provider' && data.historyReplay === undefined ? data.title : null;
}

export class TitleService {
  private readonly legacy: ChatTitles;

  constructor(private readonly deps: ChatTitlesDeps) {
    this.legacy = new ChatTitles(deps);
    deps.store.dshSessions.onAppend((sessionId, events) => {
      this.adopt(sessionId, events);
    });
  }

  readonly afterReply = (event: StoredEvent, text: string, ok: boolean): void => {
    const chat = this.deps.store.aiChats.chat(event.chat_id);
    if (!admitsChatExecution(chat) || chat.engine.kind === 'dsh') return;
    if (chat.native_admission !== 'standalone') {
      this.legacy.afterReply(event, text, ok);
      return;
    }
    if (!ok || event.message_id === null) return;
    const message = this.deps.store.assistantChat.message(event.message_id);
    if (message.role !== 'person') return;
    const title = cleanTitle(message.text);
    if (title !== null) this.deps.store.aiChats.autoTitle(chat.id, title);
  };

  afterCall(chatId: string, transcript: string): void {
    this.legacy.afterCall(chatId, transcript);
  }

  backfill(): void {
    this.legacy.backfill();
  }

  private adopt(sessionId: string, events: readonly unknown[]): void {
    for (const event of events) {
      const title = generatedTitle(event);
      if (title === null) continue;
      try {
        this.name(sessionId, title);
      } catch (cause) {
        this.deps.log.warn('assistant.title_failed', { sessionId, reason: messageOf(cause) });
      }
    }
  }

  private name(sessionId: string, generated: string): void {
    const { harnessSessions, dshSessions, aiChats } = this.deps.store;
    const grant = harnessSessions.grant(sessionId);
    const metadata =
      grant === undefined ? undefined : dshSessions.stat(sessionId, grant.profile_id);
    const title = cleanTitle(generated);
    if (metadata !== undefined && title !== null) aiChats.autoTitle(metadata.chat_id, title);
  }
}
