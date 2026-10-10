import {
  COMPACTION_EMBED,
  type AiChatRow,
  type AssistantMessageRow,
  type CompactionEmbed,
} from '@smarteverything/domain';
import type { ChatMessage } from '../../../openrouter/chat-types';
import type { Store } from '../../../store/store';
import type { ConversationLog } from '../../conversation-log';
import { explicitCache } from './context';
import type { ChatClientPort, TurnPort } from './ports';
import { pendingUsage, usageOf, type TurnUsage } from './turn-loop';

const KEEP_SHARE = 0.5;
const KEEP_ROWS_MIN = 4;
const SUMMARY_TOKENS_MAX = 4000;
const CHARS_PER_TOKEN = 4;

const SUMMARY_RULES =
  'You compact a chat between a person and their home AI. Write a dense summary of the transcript you are given: who asked for what, decisions, results, open tasks, names, ids, numbers and preferences that later messages may rely on. Plain sentences, no headings, nothing invented.';

export interface ChatContext {
  readonly summary: string | null;
  readonly rows: readonly AssistantMessageRow[];
}

export interface FitRequest {
  readonly chat: AiChatRow;
  readonly model: string;
  readonly window: number | null;
  readonly prefix: readonly unknown[];
  readonly signal: AbortSignal;
  readonly usage: (entry: TurnUsage) => void;
}

export interface CompactorDeps {
  readonly store: Store;
  readonly client: ChatClientPort;
  readonly newTurn: () => TurnPort;
  readonly conversation: ConversationLog;
}

export function tokensOf(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / CHARS_PER_TOKEN);
}

function compactionOf(row: AssistantMessageRow): CompactionEmbed | null {
  for (const embed of row.embeds) {
    const parsed = COMPACTION_EMBED.safeParse(embed);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}

export function transcriptLine(row: AssistantMessageRow): string {
  const who = row.role === 'responder' ? 'AI' : row.role === 'person' ? row.author : 'Note';
  return `${who}: ${row.text}`;
}

export function chatContext(store: Store, chatId: string): ChatContext {
  const latest = store.assistantChat.latestWithEmbed(chatId, 'compaction');
  const marker = latest === undefined ? null : compactionOf(latest);
  if (latest !== undefined && marker === null) {
    throw new Error(`The compaction note ${latest.id} has no readable end point.`);
  }
  return {
    summary: latest?.text ?? null,
    rows: store.assistantChat
      .since(chatId, marker?.through_at ?? null)
      .filter((row) => compactionOf(row) === null),
  };
}

export class Compactor {
  constructor(private readonly deps: CompactorDeps) {}

  context(chatId: string): ChatContext {
    return chatContext(this.deps.store, chatId);
  }

  async fit(request: FitRequest): Promise<ChatContext> {
    const context = this.context(request.chat.id);
    if (request.window === null) {
      return context;
    }
    const percent = this.deps.store.assistantChat.settings().compact_at_percent;
    const prefix = tokensOf(request.prefix) + tokensOf(context.summary ?? '');
    const total = prefix + tokensOf(context.rows);
    if (total < (request.window * percent) / 100) {
      return context;
    }
    const older = this.older(context.rows, request.window * KEEP_SHARE - prefix);
    const last = older.at(-1);
    if (last === undefined) {
      return context;
    }
    const summary = await this.summarise(request, context.summary, older);
    this.deps.conversation.compaction(request.chat, summary, last.created_at);
    return this.context(request.chat.id);
  }

  private older(rows: readonly AssistantMessageRow[], keep: number): AssistantMessageRow[] {
    let kept = 0;
    let split = rows.length;
    while (split > 0) {
      const next = kept + tokensOf(rows[split - 1]);
      if (rows.length - split >= KEEP_ROWS_MIN && next > keep) {
        break;
      }
      kept = next;
      split -= 1;
    }
    return rows.slice(0, split);
  }

  private async summarise(
    request: FitRequest,
    summary: string | null,
    rows: readonly AssistantMessageRow[],
  ): Promise<string> {
    const transcript = [
      ...(summary === null ? [] : [`Earlier summary: ${summary}`]),
      ...rows.map(transcriptLine),
    ].join('\n');
    const messages: ChatMessage[] = [
      { role: 'system', content: SUMMARY_RULES },
      { role: 'user', content: transcript },
    ];
    const turn = this.deps.newTurn();
    const chat = {
      model: request.model,
      messages,
      effort: null,
      maxTokens: SUMMARY_TOKENS_MAX,
      cacheControl: explicitCache(request.model),
    };
    let generationId: string | null = null;
    try {
      for await (const chunk of this.deps.client.chat(chat, request.signal)) {
        generationId = chunk.type === 'start' ? chunk.generationId : generationId;
        turn.feed(chunk);
      }
    } catch (cause) {
      if (generationId !== null) {
        request.usage(pendingUsage(generationId, request.model, 'chat'));
      }
      throw cause;
    }
    const result = turn.result();
    request.usage(usageOf(result, request.model, 'chat'));
    if (result.text.trim() === '') {
      throw new Error('The model sent an empty summary, so the chat was not compacted.');
    }
    return result.text.trim();
  }
}
