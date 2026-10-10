import { randomUUID } from 'node:crypto';
import type { AiChatRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { ConversationLog } from '../conversation-log';
import type { StreamEmit } from '../engines/openrouter/stream';
import { LOOP_LIMIT, LOOP_WINDOW_MS, PAUSED_TEXT } from './limits';

export const GUARD_AUTHOR = 'SmartEverything';

interface Pause {
  readonly person: string | null;
  readonly at: number;
}

export class LoopGuard {
  private readonly paused = new Map<string, Pause>();

  constructor(
    private readonly store: Store,
    private readonly conversation: ConversationLog,
    private readonly emit: StreamEmit,
    private readonly now: () => Date,
  ) {}

  admits(chat: AiChatRow): boolean {
    const now = this.now().getTime();
    const person = this.store.assistantEvents.personAt(chat.id);
    const window = new Date(now - LOOP_WINDOW_MS).toISOString();
    const since = person !== null && person > window ? person : window;
    if (this.store.assistantEvents.aiArrivals(chat.id, since) < LOOP_LIMIT) {
      return true;
    }
    if (!this.noted(chat.id, person, now)) {
      this.paused.set(chat.id, { person, at: now });
      this.pause(chat);
    }
    return false;
  }

  private noted(chatId: string, person: string | null, now: number): boolean {
    const last = this.paused.get(chatId);
    if (last === undefined) {
      return false;
    }
    return last.person === person && now - last.at <= LOOP_WINDOW_MS;
  }

  private pause(chat: AiChatRow): void {
    const row = this.conversation.note(chat, GUARD_AUTHOR, PAUSED_TEXT, null);
    this.emit(
      {
        type: 'chat_activity',
        chatId: chat.id,
        turnId: randomUUID(),
        messageId: row.id,
        seq: 0,
        state: 'failed',
        steps: [],
        draft: '',
        reasoning: '',
        tools: [],
        finish: 'paused',
        reason: PAUSED_TEXT,
      },
      chat.profile_id,
    );
  }
}
