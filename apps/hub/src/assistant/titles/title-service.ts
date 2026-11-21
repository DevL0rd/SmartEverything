import { z } from 'zod';
import { background, messageOf } from '@smarteverything/logging';
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
  private readonly running = new Set<Promise<void>>();

  constructor(private readonly deps: ChatTitlesDeps) {
    this.legacy = new ChatTitles(deps);
    deps.store.live.dshSessions.onAppend((sessionId, events) => {
      this.adopt(sessionId, events);
    });
  }

  readonly afterReply = (event: StoredEvent, text: string, ok: boolean): void => {
    this.track(this.replied(event, text, ok));
  };

  async settled(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled([...this.running]);
    await this.legacy.settled();
  }

  private track(work: Promise<void>): void {
    this.running.add(work);
    background(
      work.finally(() => {
        this.running.delete(work);
      }),
      'assistant.title_failed',
    );
  }

  private async replied(event: StoredEvent, text: string, ok: boolean): Promise<void> {
    const { host } = this.deps.store;
    const chat = await host.call('aiChats', 'chat', event.chat_id);
    if (!admitsChatExecution(chat) || chat.engine.kind === 'dsh') return;
    if (chat.native_admission !== 'standalone') {
      this.legacy.afterReply(event, text, ok);
      return;
    }
    if (!ok || event.message_id === null) return;
    const message = await host.call('assistantChat', 'message', event.message_id);
    if (message.role !== 'person') return;
    const title = cleanTitle(message.text);
    if (title !== null) await host.call('aiChats', 'autoTitle', chat.id, title);
  }

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
      this.track(
        this.name(sessionId, title).catch((cause: unknown) => {
          this.deps.log.warn('assistant.title_failed', { sessionId, reason: messageOf(cause) });
        }),
      );
    }
  }

  private async name(sessionId: string, generated: string): Promise<void> {
    const { host } = this.deps.store;
    const grant = await host.call('harnessSessions', 'grant', sessionId);
    const metadata =
      grant === undefined
        ? undefined
        : await host.call('dshSessions', 'stat', sessionId, grant.profile_id);
    const title = cleanTitle(generated);
    if (metadata !== undefined && title !== null)
      await host.call('aiChats', 'autoTitle', metadata.chat_id, title);
  }
}
