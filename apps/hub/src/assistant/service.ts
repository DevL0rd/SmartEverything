import {
  ASSISTANT_SETTINGS,
  ApiError,
  type AiChatChange,
  type AiChatNew,
  type AiChatRow,
  type AiUsageRow,
  type AssistantMessageRow,
  type AssistantNewMessage,
  type AssistantPost,
  type AssistantReply,
  type AssistantSettings,
  type AssistantSettingsChange,
  type AssistantStatus,
  type ChatActivityNotice,
  type MessageOrigin,
  type EngineKind,
  type ResponderApp,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import { ChatDirectory, type ChatOwner } from './chat-directory';
import type { BridgeLaunch } from './claude-plugin';
import { ResponderConnections } from './connections';
import { ConversationLog } from './conversation-log';
import { Coordination } from './coordination/asks';
import { scopedHub } from './coordination/scoped-tools';
import { AssistantDelivery, type Routing } from './delivery';
import type { PromptFacts } from './engines/openrouter/context';
import { ChatRunner, type ChatRunnerDeps } from './engines/openrouter/runner';
import type { StreamEmit } from './engines/openrouter/stream';
import { EngineRegistry } from './engines/registry';
import { AppsMonitor } from './apps-monitor';
import { AssistantFiles } from './files';
import { responderModels, responderUsage } from './providers';
import { AssistantRequests, type InboundTurn, type Sender } from './requests';
import { ClaudeChats, type ClaudeChatHooks } from './engines/claude-chats';
import { desktopInstalled } from './claude-sessions';
import { facts } from './prompt-facts';
import { ChatTitles, type TitleCatalogue } from './titles/chat-titles';
import type { VoiceResponder, VoiceResultHandler } from './voice-link';

export type { Sender } from './requests';

export type TurnEnded = (event: StoredEvent, text: string, ok: boolean) => void;

export interface AssistantServiceOptions {
  readonly store: Store;
  readonly dataDirectory: string;
  readonly announce: (status: AssistantStatus) => void;
  readonly emit: StreamEmit;
  readonly localUrl: () => string;
  readonly bridge: () => BridgeLaunch;
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

export type OpenRouterParts = Pick<ChatRunnerDeps, 'client' | 'newTurn' | 'ledger'> & {
  readonly catalogue: ChatRunnerDeps['catalogue'] & TitleCatalogue;
};

export class AssistantService {
  readonly files: AssistantFiles;
  readonly connections: ResponderConnections;
  private readonly apps: AppsMonitor;
  readonly voice: VoiceResponder;
  readonly chats: ChatDirectory;
  readonly coordination: Coordination;
  private readonly conversation: ConversationLog;
  private readonly delivery: AssistantDelivery;
  private readonly claude: ClaudeChats;
  private desktop = false;
  private readonly engines: EngineRegistry;
  private readonly requests: AssistantRequests;
  private tools: ToolHub | null = null;
  private runner: ChatRunner | null = null;
  private titles: ChatTitles | null = null;
  private voiceResult: VoiceResultHandler | null = null;
  private publishing = false;
  private readonly turnEnded = new Set<TurnEnded>();

  constructor(private readonly options: AssistantServiceOptions) {
    const { store } = options;
    this.files = new AssistantFiles({
      dataDirectory: options.dataDirectory,
      chat: store.assistantChat,
      now: options.now,
    });
    this.connections = new ResponderConnections({
      store,
      dataDirectory: options.dataDirectory,
      localUrl: options.localUrl,
      bridge: options.bridge,
    });
    this.apps = new AppsMonitor({
      apps: this.connections,
      changed: (): void => {
        this.publish();
      },
      log: options.log,
    });
    this.conversation = new ConversationLog(store);
    this.chats = new ChatDirectory(store, this.files, options.now);
    this.claude = new ClaudeChats(this.claudeHooks());
    this.engines = new EngineRegistry(store, this.claude.engine());
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
      settles: (event): boolean =>
        store.aiChats.chat(event.chat_id).engine.kind !== 'claude-session',
      done: (event, text, ok): void => {
        this.ended(event, text, ok);
      },
    });
  }

  private claudeHooks(): ClaudeChatHooks {
    const log = this.conversation;
    return {
      dataDirectory: this.options.dataDirectory,
      settings: (): AssistantSettings => this.settings(),
      pickedUp: (eventId): void => {
        log.state(eventId, 'working');
      },
      step: (eventId, step): void => {
        log.step(eventId, step);
      },
      replied: (eventId): void => {
        log.repliedTo(eventId);
      },
      settled: (eventId): void => {
        log.settled(eventId);
      },
      changed: (): void => {
        this.publish();
      },
      log: this.options.log,
    };
  }

  activity(profileId: string): ChatActivityNotice[] {
    return this.runner?.activity(profileId) ?? [];
  }

  runTurn(input: TurnRequest): { chatId: string; eventId: string } {
    const chat = this.chats.forTurn(input.profileId, input.chatId, input.title);
    return { chatId: chat.id, eventId: this.requests.turn(chat, input.text, input.origin) };
  }

  async start(): Promise<void> {
    this.options.store.assistantChat.failWorking('Stopped by a server restart.');
    this.desktop = await desktopInstalled();
    this.delivery.pump();
    this.apps.start();
  }

  attachLedger(ledger: LedgerRollup): () => void {
    const { store } = this.options;
    return ledger.rollup((row, delta) => {
      if (row.message_id !== null) {
        store.assistantChat.addCost(row.message_id, delta);
      }
      if (row.chat_id !== null) {
        store.aiChats.addCost(row.chat_id, delta);
      }
    });
  }

  onFinished(listener: TurnEnded): () => void {
    this.turnEnded.add(listener);
    return (): void => {
      this.turnEnded.delete(listener);
    };
  }

  private ended(event: StoredEvent, text: string, ok: boolean): void {
    this.coordination.finished(event, text, ok);
    this.turnEnded.forEach((listener) => {
      listener(event, text, ok);
    });
  }

  async inbound(turn: InboundTurn): Promise<{ eventId: string }> {
    return { eventId: await this.requests.inbound(turn) };
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
      emit: this.options.emit,
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
    this.titles.backfill();
    this.delivery.pump();
  }

  refreshApps(): void {
    this.apps.recheck();
  }

  stop(): void {
    this.delivery.stop();
    this.claude.stop();
    this.apps.stop();
  }

  onVoiceResult(handler: VoiceResultHandler): void {
    this.voiceResult = handler;
  }

  settings(): AssistantSettings {
    return this.options.store.assistantChat.settings();
  }

  status(): AssistantStatus {
    return {
      settings: this.settings(),
      responder: {
        mode: this.settings().mode,
        state: this.settings().mode === 'none' ? 'none' : 'ready',
        reason: null,
        conversation: null,
      },
      apps: [...this.connections.statuses],
      desktop_available: this.desktop,
    };
  }

  update(change: AssistantSettingsChange): Promise<AssistantStatus> {
    this.options.store.assistantChat.saveSettings(
      ASSISTANT_SETTINGS.parse({ ...this.settings(), ...change }),
    );
    this.delivery.pump();
    this.publish();
    this.refreshApps();
    return Promise.resolve(this.status());
  }

  async newConversation(profileId: string): Promise<AssistantStatus> {
    await this.claude.reset(this.claudeChat(profileId));
    this.publish();
    return this.status();
  }

  async openConversation(profileId: string): Promise<void> {
    await this.claude.open(this.claudeChat(profileId));
  }

  async openChat(owner: ChatOwner, chatId: string): Promise<void> {
    const chat = this.chats.own(owner, chatId);
    if (chat.engine.kind !== 'claude-session') {
      throw new ApiError('conflict', 'Only a Claude Code chat opens in Claude Desktop.');
    }
    await this.claude.open(chat);
  }

  private claudeChat(profileId: string): AiChatRow {
    const chat = this.options.store.aiChats.latestWithEngine(profileId, 'claude-session');
    if (chat === undefined) {
      throw new ApiError('conflict', 'There is no Claude Code chat yet; start one first.');
    }
    return chat;
  }

  async connect(app: ResponderApp, connected: boolean): Promise<AssistantStatus> {
    await (connected ? this.connections.connect(app) : this.connections.disconnect(app));
    this.publish();
    return this.status();
  }

  usage(): ReturnType<typeof responderUsage> {
    return responderUsage(this.settings().mode);
  }

  models(): ReturnType<typeof responderModels> {
    return responderModels(this.settings().mode, false);
  }

  engineModels(kind: EngineKind): ReturnType<typeof responderModels> {
    return responderModels(
      kind === 'codex-thread' ? 'codex-local' : kind === 'claude-session' ? kind : 'none',
      false,
    );
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

  updateChat(owner: ChatOwner, chatId: string, change: AiChatChange): Promise<AiChatRow> {
    const chat = this.chats.update(owner, chatId, change);
    this.delivery.pump();
    return Promise.resolve(chat);
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

  reply(body: AssistantReply, local: boolean): ReturnType<AssistantRequests['reply']> {
    return this.requests.reply(body, local);
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
