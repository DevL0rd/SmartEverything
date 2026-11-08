import {
  helperDialogueOf,
  CALL_TRANSCRIPT_EMBED,
  type AssistantMessageRow,
  type CallTurn,
} from '@smarteverything/domain';
import { Logger, background, messageOf } from '@smarteverything/logging';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import type { MemoryManager } from './manager';
import { ManagerFailedError } from './manager-model';
import type { MemoryPrincipal } from './principal';
import type { MemoryService } from './service';
import { trivial } from './trivial';

const log = new Logger('hub.memory');

export interface LearnerPorts {
  readonly store: Pick<Store, 'aiChats' | 'assistantChat' | 'aiMemories' | 'personAccess'>;
  readonly memory: Pick<MemoryService, 'offered'>;
  readonly manager: Pick<MemoryManager, 'exchange'>;
}

export interface Exchange {
  readonly person: string;
  readonly reply: string;
}

export function callExchanges(turns: readonly CallTurn[]): Exchange[] {
  const found: Exchange[] = [];
  let person: string[] = [];
  let reply: string[] = [];
  const close = (): void => {
    if (person.length > 0) found.push({ person: person.join('\n'), reply: reply.join('\n') });
    person = [];
    reply = [];
  };
  for (const turn of turns) {
    if (turn.who === 'tool') continue;
    if (turn.who === 'person') {
      if (reply.length > 0) close();
      person.push(turn.text);
    } else if (person.length > 0) reply.push(turn.text);
  }
  close();
  return found;
}

function isPersonText(message: AssistantMessageRow): boolean {
  return (
    message.role === 'person' && message.kind === 'text' && helperDialogueOf(message) === undefined
  );
}

export class MemoryLearner {
  private readonly tails = new Map<string, Promise<void>>();

  constructor(private readonly ports: LearnerPorts) {}

  readonly afterTurn = (event: StoredEvent, text: string, ok: boolean): void => {
    if (!ok || event.message_id === null) return;
    const messageId = event.message_id;
    this.enqueue(event.chat_id, () => this.learnTurn(event, messageId, text));
  };

  afterCall(chatId: string, messageId: string): void {
    this.enqueue(chatId, () => this.learnCall(chatId, messageId));
  }

  async settled(): Promise<void> {
    while (this.tails.size > 0) await Promise.all([...this.tails.values()]);
  }

  private enqueue(chatId: string, job: () => Promise<void>): void {
    const next = (this.tails.get(chatId) ?? Promise.resolve())
      .then(job)
      .catch((cause: unknown) => {
        log.exception('memory.learn_failed', cause, { chatId });
      })
      .finally(() => {
        if (this.tails.get(chatId) === next) this.tails.delete(chatId);
      });
    this.tails.set(chatId, next);
    background(next, 'memory.learn_queue_failed');
  }

  private principal(profileId: string, chatId: string, messageId: string): MemoryPrincipal | null {
    const { aiChats, personAccess } = this.ports.store;
    const { role } = personAccess.byProfile(profileId);
    return role === 'guest' || aiChats.chat(chatId).kind === 'subagent'
      ? null
      : { profileId, role, chatId, messageId };
  }

  private mark(chatId: string, at: string): void {
    const { aiMemories } = this.ports.store;
    const through = aiMemories.learnedThrough(chatId);
    if (through === undefined || through < at) aiMemories.setLearnedThrough(chatId, at);
  }

  private async learnTurn(event: StoredEvent, messageId: string, reply: string): Promise<void> {
    const person = this.ports.store.assistantChat.message(messageId);
    const who = isPersonText(person)
      ? this.principal(event.profile_id, event.chat_id, person.id)
      : null;
    if (who === null) return;
    if (this.ports.memory.offered(who)) await this.catchUp(who, person, reply);
    else this.mark(event.chat_id, person.created_at);
  }

  private async catchUp(
    who: MemoryPrincipal,
    person: AssistantMessageRow,
    reply: string,
  ): Promise<void> {
    const { assistantChat, aiMemories } = this.ports.store;
    const chatId = person.chat_id;
    const through = aiMemories.learnedThrough(chatId);
    if (through !== undefined && person.created_at <= through) return;
    const unlearned =
      through === undefined
        ? [person]
        : assistantChat.since(chatId, through).filter((row) => row.created_at <= person.created_at);
    for (const message of unlearned.filter(isPersonText)) {
      const text = message.id === person.id ? reply : this.answered(message.id);
      const done =
        text === null ||
        (await this.learn(
          { ...who, messageId: message.id },
          { person: message.text, reply: text },
        ));
      if (!done) return;
      this.mark(chatId, message.created_at);
    }
  }

  private async learnCall(chatId: string, messageId: string): Promise<void> {
    const call = this.ports.store.assistantChat.find(messageId);
    if (call?.chat_id !== chatId || call.kind !== 'call') return;
    const who = this.principal(call.profile_id, chatId, call.id);
    if (who === null) return;
    const transcript = CALL_TRANSCRIPT_EMBED.safeParse(
      call.embeds.find((embed) => embed.kind === 'call_transcript'),
    );
    if (this.ports.memory.offered(who) && transcript.success) {
      for (const exchange of callExchanges(transcript.data.turns)) {
        if (!(await this.learn(who, exchange))) return;
      }
    }
    this.mark(chatId, call.created_at);
  }

  private answered(messageId: string): string | null {
    const reply = this.ports.store.assistantChat
      .repliesTo(messageId)
      .filter((row) => row.state === 'answered')
      .at(-1);
    return reply?.text ?? null;
  }

  private async learn(who: MemoryPrincipal, exchange: Exchange): Promise<boolean> {
    if (trivial(exchange.person) || who.chatId === null || !this.ports.memory.offered(who))
      return true;
    try {
      await this.ports.manager.exchange(who, who.chatId, exchange.person, exchange.reply);
      return true;
    } catch (cause) {
      if (!(cause instanceof ManagerFailedError)) throw cause;
      log.warn('memory.learn_deferred', { chatId: who.chatId, reason: messageOf(cause) });
      return false;
    }
  }
}
