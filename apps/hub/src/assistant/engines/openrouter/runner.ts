import {
  AI_EFFORT,
  AI_MODEL_CHOICE,
  chatSearchesWeb,
  ApiError,
  type AiChatRow,
  type AiResolvedModel,
  type AssistantMessageRow,
  type ChatActivityNotice,
  type UsageWork,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ToolCaller } from '../../../ai-tools/hub-tool';
import type { ToolHub } from '../../../ai-tools/tool-hub';
import { chatSet } from '../../../ai-tools/tool-sets';
import type { ChatMessage } from '../../../openrouter/chat-types';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { Store } from '../../../store/store';
import type { MediaNotes } from '../../../transcripts/media-notes';
import type { ConversationLog } from '../../conversation-log';
import { scopedHub } from '../../coordination/scoped-tools';
import type { AssistantFiles } from '../../files';
import { reasonWithActions } from '../../failure-reason';
import { reasonCodeOf } from '../../reason-code';
import type { Engine, EngineStatus } from '../engine';
import { Compactor, type ChatContext } from './compaction';
import {
  historyMessages,
  stableMessage,
  summaryMessage,
  turnMessage,
  type PromptFacts,
} from './context';
import { planMedia, type MediaPlan, type MediaView } from './media-view';
import type { CataloguePort, ChatClientPort, LedgerPort, TurnPort } from './ports';
import { TurnStream, type StreamEmit } from './stream';
import { turnCaller } from './turn-caller';
import { runLoop, type TurnUsage } from './turn-loop';

const FLUSH_ROW_MS = 2000;
const COMPACT_TIMEOUT_MS = 120_000;

export interface ChatRunnerDeps {
  readonly store: Store;
  readonly client: ChatClientPort;
  readonly catalogue: CataloguePort;
  readonly newTurn: () => TurnPort;
  readonly ledger: LedgerPort;
  readonly tools: () => ToolHub | null;
  readonly conversation: ConversationLog;
  readonly files: AssistantFiles;
  readonly notes: MediaNotes;
  readonly facts: (chat: AiChatRow) => PromptFacts;
  readonly emit: StreamEmit;
  readonly finished: (event: StoredEvent, text: string, ok: boolean) => void;
  readonly log: Logger;
}

class Turn {
  readonly controller = new AbortController();
  readonly usage: TurnUsage[] = [];
  readonly actions: string[] = [];
  private reply: string | null = null;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly event: StoredEvent,
    readonly chat: AiChatRow,
    readonly stream: TurnStream,
  ) {}

  get replyId(): string | null {
    return this.reply;
  }

  adopt(replyId: string): void {
    this.reply = replyId;
  }

  scheduleFlush(flush: (replyId: string, text: string) => void): void {
    this.flushTimer ??= setTimeout(() => {
      this.flushTimer = null;
      if (this.reply !== null) {
        flush(this.reply, this.stream.current().draft);
      }
    }, FLUSH_ROW_MS);
  }

  close(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.stream.close();
  }
}

const IN_HISTORY: ReadonlySet<StoredEvent['kind']> = new Set(['chat', 'report', 'plugin']);

function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The AI could not answer';
}

export class ChatRunner {
  private readonly turns = new Map<string, Turn>();
  private readonly queues = new Map<string, Promise<void>>();

  private readonly compactor: Compactor;

  constructor(private readonly deps: ChatRunnerDeps) {
    this.compactor = new Compactor(deps);
  }

  engine(): Engine {
    return {
      kind: 'openrouter',
      status: (chat): EngineStatus => ({
        state: this.turns.has(chat.id) ? 'working' : 'ready',
        reason: null,
      }),
      deliver: (event, chat): Promise<void> => this.enqueue(event, chat),
      interrupt: (chat): Promise<void> => {
        this.turns.get(chat.id)?.controller.abort();
        return Promise.resolve();
      },
    };
  }

  async compact(chat: AiChatRow): Promise<boolean> {
    if (this.turns.has(chat.id)) {
      throw new ApiError('conflict', 'The AI is answering in this chat; compact when it is done.');
    }
    const model = this.resolve(chat);
    const before = this.compactor.context(chat.id).summary;
    const usage: TurnUsage[] = [];
    const after = await this.compactor.fit({
      chat,
      model: model.model_id,
      window: this.deps.catalogue.model(model.model_id).context_length,
      prefix: [],
      signal: AbortSignal.timeout(COMPACT_TIMEOUT_MS),
      usage: (entry): void => {
        usage.push(entry);
      },
      force: true,
    });
    this.book(chat, null, usage, null);
    return after.summary !== before;
  }

  activity(profileId: string): ChatActivityNotice[] {
    return [...this.turns.values()]
      .filter((turn) => turn.chat.profile_id === profileId)
      .map((turn) => turn.stream.current());
  }

  private enqueue(event: StoredEvent, chat: AiChatRow): Promise<void> {
    const previous = this.queues.get(chat.id) ?? Promise.resolve();
    const next = previous.then(() => this.turn(event, chat));
    const settled = next.finally(() => {
      if (this.queues.get(chat.id) === settled) {
        this.queues.delete(chat.id);
      }
    });
    this.queues.set(chat.id, settled);
    return next;
  }

  private open(event: StoredEvent, chat: AiChatRow): Turn {
    const target = {
      chatId: chat.id,
      turnId: event.id,
      messageId: event.message_id,
      profileId: chat.profile_id,
    };
    const turn = new Turn(event, chat, new TurnStream(target, this.deps.emit));
    this.turns.set(chat.id, turn);
    return turn;
  }

  private async turn(event: StoredEvent, chat: AiChatRow): Promise<void> {
    const turn = this.open(event, chat);
    this.deps.conversation.stateOf(event.message_id, 'working');
    turn.stream.snapshot('thinking', null, null);
    try {
      await this.answer(turn);
    } catch (cause) {
      this.failed(turn, cause);
    } finally {
      this.close(turn);
    }
  }

  private close(turn: Turn): void {
    turn.close();
    this.turns.delete(turn.chat.id);
  }

  private async answer(turn: Turn): Promise<void> {
    const model = this.resolve(turn.chat);
    const reply = this.deps.conversation.startReply(turn.chat, this.replyTo(turn), model.model_id);
    turn.adopt(reply.id);
    const hub = scopedHub(this.deps.tools(), turn.chat.tools);
    const row = this.deps.catalogue.model(model.model_id);
    const images = row.input_modalities.includes('image');
    const tools = hub === null ? [] : hub.openAiTools(chatSet(hub.list()));
    const system = [stableMessage(this.deps.facts(turn.chat))];
    const context = await this.compactor.fit({
      chat: turn.chat,
      model: model.model_id,
      window: row.context_length,
      prefix: [...system, ...tools],
      signal: turn.controller.signal,
      usage: (entry): void => {
        turn.usage.push(entry);
      },
    });
    const { rows, media } = await this.media(turn, context, images);
    const result = await runLoop({
      client: this.deps.client,
      newTurn: this.deps.newTurn,
      model,
      messages: [...system, ...(await this.history(turn, context, rows, media.view))],
      tools,
      hub,
      caller: this.callerOf(turn),
      images: { model: model.model_id, allowed: images },
      work: this.workOf(turn),
      webSearch: this.searches(turn.chat),
      signal: turn.controller.signal,
      hooks: this.hooks(turn),
    });
    media.afterTurn();
    this.deps.conversation.finishReply(reply.id, result.text, {
      model: result.model,
      steps: turn.stream.settled(),
      sources: result.sources,
    });
    this.record(turn, reply.id);
    this.compactor.measure(turn.chat.id, row.context_length, [...system, ...tools]);
    this.deps.conversation.stateOf(turn.event.message_id, 'answered');
    turn.stream.snapshot('idle', result.finish ?? 'stop', null);
    this.deps.finished(turn.event, result.text, true);
  }

  private failed(turn: Turn, cause: unknown): void {
    const stopped = turn.controller.signal.aborted;
    const reason = reasonWithActions(stopped ? 'Stopped.' : reasonOf(cause), turn.actions);
    const code = reasonCodeOf(cause, stopped);
    this.deps.log.warn('assistant.chat_turn_failed', { chatId: turn.chat.id, reason, code });
    if (turn.replyId !== null) {
      const { draft } = turn.stream.current();
      this.deps.conversation.failReply(
        turn.replyId,
        { text: draft, reason, code },
        turn.stream.settled(),
      );
    }
    this.record(turn, turn.replyId ?? turn.event.message_id);
    this.deps.conversation.failedMessage(turn.event.message_id, reason, code);
    turn.stream.snapshot('failed', stopped ? 'stopped' : 'error', reason);
    this.deps.finished(turn.event, reason, false);
  }

  private replyTo(turn: Turn): string | null {
    return turn.event.kind === 'chat' || turn.event.kind === 'plugin' || turn.event.kind === 'voice'
      ? turn.event.message_id
      : null;
  }

  private hooks(turn: Turn): Parameters<typeof runLoop>[0]['hooks'] {
    return {
      stream: turn.stream,
      text: (): void => {
        turn.scheduleFlush((replyId, text) => {
          this.deps.conversation.flushReply(replyId, text);
        });
      },
      toolLine: (line): void => {
        turn.actions.push(line);
        this.deps.conversation.action(turn.chat, line);
      },
      toolFailed: (tool, reason): void => {
        this.deps.log.warn('assistant.tool_failed', { chatId: turn.chat.id, tool, reason });
      },
      usage: (entry): void => {
        turn.usage.push(entry);
      },
      retried: (reason): void => {
        this.deps.log.warn('assistant.model_retry', { chatId: turn.chat.id, reason });
      },
    };
  }

  private searches(chat: AiChatRow): boolean {
    return chatSearchesWeb(chat, this.deps.store.assistantChat.settings().web_search_default);
  }

  private resolve(chat: AiChatRow): AiResolvedModel {
    const choice = AI_MODEL_CHOICE.safeParse(chat.engine.model);
    const effort = AI_EFFORT.safeParse(chat.engine.effort);
    return this.deps.catalogue.resolve(
      choice.success ? choice.data : null,
      effort.success ? effort.data : null,
    );
  }

  private workOf(turn: Turn): UsageWork {
    if (turn.chat.kind === 'subagent') {
      return 'subagent';
    }
    if (turn.event.kind !== 'wake') {
      return 'chat';
    }
    const { message_id: noteId } = turn.event;
    const note = noteId === null ? null : this.deps.store.assistantChat.message(noteId);
    return note?.origin?.source === 'schedule' ? 'routine' : 'wake';
  }

  private callerOf(turn: Turn): ToolCaller {
    const { store } = this.deps;
    const { event } = turn;
    return turnCaller({
      chat: turn.chat,
      event,
      latest: event.message_id === null ? null : store.assistantChat.message(event.message_id),
      client: event.client_id === null ? undefined : store.clients.byId(event.client_id),
    });
  }

  private async media(
    turn: Turn,
    context: ChatContext,
    images: boolean,
  ): Promise<{ rows: AssistantMessageRow[]; media: MediaPlan }> {
    const rows = context.rows.filter(
      (item) => !(item.role === 'responder' && item.state === 'working'),
    );
    const media = await planMedia({
      rows,
      newest: this.newest(turn),
      images,
      store: this.deps.store,
      files: this.deps.files,
      notes: this.deps.notes,
      log: this.deps.log,
    });
    return { rows, media };
  }

  private newest(turn: Turn): ReadonlySet<string> {
    const { message_id: id } = turn.event;
    if (id === null) {
      return new Set();
    }
    const referenced = this.deps.store.assistantChat.message(id).reply_to;
    return new Set(referenced === null ? [id] : [id, referenced]);
  }

  private async history(
    turn: Turn,
    context: ChatContext,
    rows: readonly AssistantMessageRow[],
    media: MediaView,
  ): Promise<ChatMessage[]> {
    const history = await historyMessages(rows, media);
    const extra: ChatMessage[] = IN_HISTORY.has(turn.event.kind)
      ? []
      : [{ role: 'user', content: turn.event.text }];
    const summary = context.summary === null ? [] : [summaryMessage(context.summary)];
    return [...summary, ...history, ...extra, turnMessage(this.deps.facts(turn.chat))];
  }

  private record(turn: Turn, messageId: string | null): void {
    this.book(turn.chat, turn.event.client_id, turn.usage.splice(0), messageId);
  }

  private book(
    chat: AiChatRow,
    clientId: string | null,
    entries: readonly TurnUsage[],
    messageId: string | null,
  ): void {
    entries.forEach((entry) => {
      this.deps.ledger.record({
        ...entry,
        profile_id: chat.profile_id,
        client_id: clientId,
        chat_id: chat.id,
        message_id: messageId,
      });
    });
  }
}
