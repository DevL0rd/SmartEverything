import {
  ASSISTANT_SETTINGS,
  RETIRED_STATUS_FIELDS,
  ApiError,
  type AiChatChange,
  type AiChatBranch,
  type AiChatHit,
  type AiChatNew,
  type AiChatRow,
  type AiChatSearch,
  type AiEdit,
  type AiRetryFrom,
  type AiUsageRow,
  type AssistantMessageRow,
  type AssistantNewMessage,
  type AssistantPost,
  type AssistantSettings,
  type AssistantSettingsChange,
  type AssistantStatus,
  type ChatActivityNotice,
  type ChatStreamNotice,
  type MessageOrigin,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import { ChatBranches } from './chat-branch';
import { ChatDirectory, type ChatOwner } from './chat-directory';
import { ConversationLog } from './conversation-log';
import { Coordination } from './coordination/asks';
import { costRolledUp } from './cost-rollup';
import { scopedHub } from './coordination/scoped-tools';
import { AssistantDelivery, type Routing } from './delivery';
import type { PromptFacts } from './engines/openrouter/context';
import { ChatRunner, type ChatRunnerDeps } from './engines/openrouter/runner';
import type { StreamEmit } from './engines/openrouter/stream';
import type { EngineStatus } from './engines/engine';
import { EngineRegistry } from './engines/registry';
import { AssistantFiles } from './files';
import { AssistantRequests, type InboundTurn, type Sender } from './requests';
import { facts } from './prompt-facts';
import type { SideCatalogue } from './side-completion';
import { ReplySuggestions } from './suggestions/reply-suggestions';
import { ChatTitles } from './titles/chat-titles';
import type { VoiceResponder, VoiceResultHandler } from './voice-link';

export type { Sender } from './requests';

const RESTART_REASON = 'Stopped by a server restart.';

export interface TurnActivity {
  readonly eventId: string;
  readonly state: ChatActivityNotice['state'];
  readonly steps: readonly string[];
}

export type TurnActivityListener = (activity: TurnActivity) => void;

export type TurnEnded = (event: StoredEvent, text: string, ok: boolean) => void;

export interface AssistantServiceOptions {
  readonly store: Store;
  readonly dataDirectory: string;
  readonly announce: (status: AssistantStatus) => void;
  readonly emit: StreamEmit;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface TurnRequest {
  readonly profileId: string;
  readonly chatId?: string;
  readonly title?: string;
  readonly text: string;
  readonly origin: MessageOrigin;
}

export interface LedgerRollup {
  readonly rollup: (sink: (row: AiUsageRow, deltaMicros: number) => void) => () => void;
}

export type OpenRouterParts = Pick<ChatRunnerDeps, 'client' | 'newTurn' | 'ledger' | 'notes'> & {
  readonly catalogue: ChatRunnerDeps['catalogue'] & SideCatalogue;
};

export class AssistantService {
  readonly files: AssistantFiles;
  readonly voice: VoiceResponder;
  readonly chats: ChatDirectory;
  readonly branches: ChatBranches;
  readonly coordination: Coordination;
  private readonly conversation: ConversationLog;
  private readonly delivery: AssistantDelivery;
  private readonly engines: EngineRegistry;
  private readonly requests: AssistantRequests;
  private tools: ToolHub | null = null;
  private runner: ChatRunner | null = null;
  private titles: ChatTitles | null = null;
  private voiceResult: VoiceResultHandler | null = null;
  private publishing = false;
  private readonly turnEnded = new Set<TurnEnded>();
  private readonly turnActivity = new Set<TurnActivityListener>();

  constructor(private readonly options: AssistantServiceOptions) {
    const { store } = options;
    this.files = new AssistantFiles({
      dataDirectory: options.dataDirectory,
      chat: store.assistantChat,
      now: options.now,
    });
    this.conversation = new ConversationLog(store);
    this.chats = new ChatDirectory(store, this.files, options.now);
    this.branches = new ChatBranches(store, this.files, this.chats);
    this.engines = new EngineRegistry(store);
    this.delivery = this.deliveryOf();
    this.coordination = new Coordination({
      store,
      chats: this.chats,
      conversation: this.conversation,
      emit: options.emit,
      added: (): void => {
        this.delivery.added();
      },
      now: options.now,
    });
    this.requests = this.requestsOf();
    this.voice = {
      ready: (chatId?: string): string | null => this.voiceReady(chatId),
      chatForCall: ({ chatId, ...place }): string => this.chats.chatForCall(place, chatId).id,
      request: (task): string => this.requests.voice(task),
      callEnded: (chatId, transcript): void => {
        this.titles?.afterCall(chatId, transcript);
      },
    };
  }

  private deliveryOf(): AssistantDelivery {
    return new AssistantDelivery({
      events: this.options.store.assistantEvents,
      route: (event): Routing => this.engines.route(event),
      delivered: (event): void => {
        this.conversation.delivered(event.id);
        this.publish();
      },
      failed: (event, reason): void => {
        this.conversation.failed(event, reason);
        this.ended(event, reason, false);
        this.publish();
      },
      log: this.options.log,
    });
  }

  private requestsOf(): AssistantRequests {
    const { store } = this.options;
    return new AssistantRequests({
      store,
      files: this.files,
      chats: this.chats,
      conversation: this.conversation,
      delivery: (): AssistantDelivery => this.delivery,
      voiceResult: (): VoiceResultHandler | null => this.voiceResult,
      done: (event, text, ok): void => {
        this.ended(event, text, ok);
      },
    });
  }

  activity(profileId: string): ChatActivityNotice[] {
    return this.runner?.activity(profileId) ?? [];
  }

  runTurn(input: TurnRequest): { chatId: string; eventId: string } {
    const chat = this.chats.forTurn(input.profileId, input.chatId, input.title);
    return { chatId: chat.id, eventId: this.requests.turn(chat, input.text, input.origin) };
  }

  start(): void {
    this.conversation.interrupted(RESTART_REASON);
    this.delivery.pump();
  }

  attachLedger(ledger: LedgerRollup): () => void {
    const { store } = this.options;
    return ledger.rollup(costRolledUp(store));
  }

  onFinished(listener: TurnEnded): () => void {
    this.turnEnded.add(listener);
    return (): void => {
      this.turnEnded.delete(listener);
    };
  }

  onActivity(listener: TurnActivityListener): () => void {
    this.turnActivity.add(listener);
    return (): void => {
      this.turnActivity.delete(listener);
    };
  }

  private fedActivity(notice: ChatActivityNotice | ChatStreamNotice): void {
    if (notice.type !== 'chat_activity') {
      return;
    }
    const activity = { eventId: notice.turnId, state: notice.state, steps: notice.steps };
    this.turnActivity.forEach((listener) => {
      listener(activity);
    });
  }

  private ended(event: StoredEvent, text: string, ok: boolean): void {
    this.coordination.finished(event, text, ok);
    this.turnEnded.forEach((listener) => {
      listener(event, text, ok);
    });
  }

  inbound(turn: InboundTurn): Promise<{ eventId: string; messageId: string }> {
    return this.requests.inbound(turn);
  }

  systemNote(chatId: string, text: string, author: string): AssistantMessageRow {
    return this.conversation.note(this.options.store.aiChats.chat(chatId), author, text, null);
  }

  attachTools(tools: ToolHub): void {
    this.tools = tools;
  }

  attachOpenRouter(parts: OpenRouterParts): void {
    const runner = new ChatRunner({
      ...parts,
      store: this.options.store,
      tools: (): ToolHub | null => this.tools,
      conversation: this.conversation,
      files: this.files,
      facts: (chat): PromptFacts =>
        facts(this.options.store, chat, scopedHub(this.tools, chat.tools), this.options.now()),
      emit: (notice, profileId): void => {
        this.options.emit(notice, profileId);
        this.fedActivity(notice);
      },
      finished: (event, text, ok): void => {
        this.requests.finished(event, text, ok);
      },
      log: this.options.log,
    });
    this.runner = runner;
    this.engines.attach(runner.engine());
    const { store, now, log } = this.options;
    this.titles = new ChatTitles({ ...parts, store, now, log });
    this.onFinished(this.titles.afterReply);
    this.onFinished(new ReplySuggestions({ ...parts, store, log }).afterReply);
    this.titles.backfill();
    this.delivery.pump();
  }

  stop(): void {
    this.delivery.stop();
  }

  onVoiceResult(handler: VoiceResultHandler): void {
    this.voiceResult = handler;
  }

  settings(): AssistantSettings {
    return this.options.store.assistantChat.settings();
  }

  status(): AssistantStatus {
    return { settings: this.settings(), ...RETIRED_STATUS_FIELDS };
  }

  update(change: AssistantSettingsChange): Promise<AssistantStatus> {
    this.options.store.assistantChat.saveSettings(
      ASSISTANT_SETTINGS.parse({ ...this.settings(), ...change }),
    );
    this.delivery.pump();
    this.publish();
    return Promise.resolve(this.status());
  }

  messages(chatId: string, before: string | undefined, limit: number): AssistantMessageRow[] {
    return this.options.store.assistantChat.messages({ chatId, before, limit });
  }

  async remove(profileId: string, ids: readonly string[]): Promise<void> {
    const chat = this.options.store.assistantChat;
    const own = ids.filter((id) => chat.message(id).profile_id === profileId);
    if (own.length !== ids.length) {
      throw new ApiError('forbidden', 'Only messages of your own chat can be deleted.');
    }
    await this.files.remove(chat.removeMessages(own));
  }

  createChat(owner: ChatOwner, input: AiChatNew): AiChatRow {
    return this.chats.create(owner, input);
  }

  branchChat(owner: ChatOwner, chatId: string, body: AiChatBranch): Promise<AiChatRow> {
    return this.branches.branch(owner, chatId, body);
  }

  searchChats(owner: ChatOwner, query: AiChatSearch): AiChatHit[] {
    return this.chats.search(owner, query);
  }

  updateChat(owner: ChatOwner, chatId: string, change: AiChatChange): Promise<AiChatRow> {
    const chat = this.chats.update(owner, chatId, change);
    this.delivery.pump();
    return Promise.resolve(chat);
  }

  engineStatus(chat: AiChatRow): EngineStatus | null {
    return this.engines.engineOf(chat)?.status(chat) ?? null;
  }

  async compact(owner: ChatOwner, chatId: string): Promise<boolean> {
    return (await this.runner?.compact(this.chats.own(owner, chatId))) ?? false;
  }

  async interrupt(owner: ChatOwner, chatId: string): Promise<void> {
    const chat = this.chats.own(owner, chatId);
    const engine = this.engines.engineOf(chat);
    if (engine === null) {
      throw new ApiError('conflict', 'Nothing is running in this chat.');
    }
    await engine.interrupt(chat);
  }

  send(sender: Sender, body: AssistantNewMessage, chatId?: string): AssistantMessageRow {
    const owner = {
      profileId: sender.profileId,
      role: this.options.store.clients.byId(sender.clientId).role,
    };
    const chat =
      chatId === undefined
        ? this.chats.defaultChat(sender.profileId)
        : this.chats.own(owner, chatId);
    return this.requests.send(sender, body, chat);
  }

  retry(
    owner: ChatOwner,
    target: { readonly chatId: string; readonly messageId: string },
    from: AiRetryFrom,
  ): Promise<AssistantMessageRow> {
    return this.requests.retry(this.chats.own(owner, target.chatId), target.messageId, from);
  }

  edit(
    owner: ChatOwner,
    target: { readonly chatId: string; readonly messageId: string },
    body: AiEdit,
  ): Promise<AssistantMessageRow> {
    return this.requests.edit(this.chats.own(owner, target.chatId), target.messageId, body);
  }

  post(body: AssistantPost, local: boolean): Promise<AssistantMessageRow> {
    return this.requests.post(body, local, () => this.ownerProfile());
  }

  private ownerProfile(): string {
    const owner = this.options.store.clients.owner();
    if (owner === undefined) {
      throw new ApiError('conflict', 'This server has no owner yet.');
    }
    return this.options.store.profiles.activeOf(owner.id).id;
  }

  private voiceReady(chatId?: string): string | null {
    if (chatId === undefined) {
      return null;
    }
    return this.engines.ready(this.options.store.aiChats.chat(chatId));
  }

  private publish(): void {
    if (this.publishing) {
      return;
    }
    this.publishing = true;
    queueMicrotask(() => {
      this.publishing = false;
      this.options.announce(this.status());
    });
  }
}
