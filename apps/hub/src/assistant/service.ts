import { ProjectFilesService } from '../projects/service';
import { removeChatTree, type RemovalAdmission } from './remove-chat-tree';
import {
  admitHarnessChange,
  closeReplacedHarness,
  selectChatEngineChange,
  codexPermissionChange,
} from './engines/dsh/binding';
import type { z } from 'zod';
import { harnessEngine } from './engines/dsh/wiring';
import type { HarnessService } from '../harness/service';
import type { HarnessDispatcher } from '@smarteverything/harness/process';
import type { AiAgentRun, AI_AGENT_RUN_CONTROL } from '@smarteverything/domain';
import {
  assistantFiles,
  assistantDelivery,
  assistantRequests,
  assistantChats,
  assistantCoordination,
} from './service-routing';
import { assistantVoice } from './service-voice';
import {
  patchAssistantSettings,
  legacyAssistantSettings,
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
  type AssistantMessageRow,
  type AssistantNewMessage,
  type AssistantPost,
  type AssistantSettings,
  type AssistantSettingsChange,
  type AssistantStatus,
  type ChatActivityNotice,
} from '@smarteverything/domain';
import type { ComputerAiDirectory } from '../computers/ai-directory';
import { assistantAuxiliaries } from './auxiliary-wiring';
import { ComputerProviders } from './computer-providers';
import { EngineSelections } from './engine-selections';
import { computerRunners } from './computer-wiring';
import type { ClaudeRunner } from './engines/claude/runner';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { MediaNotes } from '../transcripts/media-notes';
import type { StoredEvent } from '../store/repositories/assistant-events';
import { ChatBranches } from './chat-branch';
import type { ChatDirectory, ChatOwner } from './chat-directory';
import { StatusPublisher } from './status-publisher';
import { ownerProfile } from './profile';
import { TurnListeners } from './turn-listeners';
import { ConversationLog } from './conversation-log';
import type { Coordination } from './coordination/asks';
import { costRolledUp } from './cost-rollup';
import type { AssistantDelivery } from './delivery';
import { removeConversationMessages, mutableChat } from './remove-messages';
import type { EngineStatus } from './engines/engine';
import { EngineRegistry } from './engines/registry';
import type { AssistantFiles } from './files';
import type { AssistantRequests, InboundTurn, Sender } from './requests';
import type { ChatTitles } from './titles/chat-titles';
import type { VoiceResponder, VoiceResultHandler } from './voice-link';
import type {
  AssistantServiceOptions,
  LedgerRollup,
  TurnActivityListener,
  TurnEnded,
  TurnRequest,
} from './service-contract';
export type * from './service-contract';
export type { Sender } from './requests';
const RESTART_REASON = 'Stopped by a server restart.';
export class AssistantService {
  readonly files: AssistantFiles;
  readonly voice: VoiceResponder;
  readonly chats: ChatDirectory;
  readonly branches: ChatBranches;
  readonly projects: ProjectFilesService;
  readonly coordination: Coordination;
  private readonly conversation: ConversationLog;
  private readonly delivery: AssistantDelivery;
  private readonly engines: EngineRegistry;
  private readonly requests: AssistantRequests;
  selections: EngineSelections | null = null;
  claude: ClaudeRunner | null = null;
  readonly computerProviders = new ComputerProviders();
  private tools: ToolHub | null = null;
  private harness: HarnessService | null = null;
  private titles: ChatTitles | null = null;
  private voiceResult: VoiceResultHandler | null = null;
  private readonly publisher = new StatusPublisher(() => {
    this.options.announce(this.status());
  });
  private readonly listeners = new TurnListeners();
  constructor(private readonly options: AssistantServiceOptions) {
    const { store } = options;
    this.projects = new ProjectFilesService(store, options.dataDirectory);
    this.files = assistantFiles(options, this.projects);
    this.conversation = new ConversationLog(store);
    this.chats = assistantChats(options, this.files, () => this.selections, this.projects);
    this.branches = new ChatBranches(store, this.files, this.chats);
    this.engines = new EngineRegistry(store);
    this.delivery = assistantDelivery(options, this.engines, {
      admit: (event): boolean => this.coordination.admit(event),
      delivered: (event): void => {
        this.conversation.delivered(event.id);
        this.publisher.publish();
      },
      failed: (event, reason): void => {
        this.conversation.failed(event, reason);
        this.ended(event, reason, false);
        this.publisher.publish();
      },
    });
    this.coordination = assistantCoordination(options, {
      tools: (): ToolHub | null => this.tools,
      chats: this.chats,
      conversation: this.conversation,
      added: (): void => {
        this.delivery.added();
      },
    });
    this.requests = assistantRequests(
      options,
      { files: this.files, chats: this.chats, conversation: this.conversation },
      {
        delivery: () => this.delivery,
        voiceResult: () => this.voiceResult,
        done: (event, text, ok): void => {
          this.ended(event, text, ok);
        },
      },
    );
    this.voice = this.voiceOf();
  }
  private voiceOf(): VoiceResponder {
    return assistantVoice({
      store: this.options.store,
      engines: this.engines,
      chats: this.chats,
      requests: this.requests,
      afterCall: (chatId, transcript): void => {
        this.titles?.afterCall(chatId, transcript);
      },
    });
  }
  activity(profileId: string): ChatActivityNotice[] {
    return [
      ...this.engines.activity(profileId),
      ...[...this.computerProviders.values()].flatMap((runner) => runner.activity(profileId)),
    ];
  }
  previewError(
    id: string,
    scope: { readonly chatId: string; readonly profileId: string; readonly clientId: string },
    text: string,
  ): void {
    this.requests.previewError(id, scope, text);
  }
  runTurn(input: TurnRequest): { chatId: string; eventId: string } {
    const chat = this.chats.forTurn(input.profileId, input.chatId, input.title);
    return { chatId: chat.id, eventId: this.requests.turn(chat, input.text, input.origin) };
  }
  start(): void {
    this.coordination.restart();
    this.conversation.interrupted(RESTART_REASON);
    this.delivery.pump();
  }
  attachComputerAi(directory: ComputerAiDirectory): void {
    this.selections = new EngineSelections(this.options.store, directory, this.options.log);
    const runners = computerRunners(this.options, directory, {
      conversation: this.conversation,
      files: this.files,
      tools: (): ToolHub | null => this.tools,
      finished: (event, text, ok): void => {
        this.requests.finished(event, text, ok);
      },
      command: (chat, text): void => {
        this.requests.turn(chat, text, {
          source: 'app',
          plugin_id: null,
          device_id: null,
          name: null,
        });
      },
    });
    this.claude = runners.get('claude') ?? null;
    for (const [runtime, runner] of runners) this.computerProviders.set(runtime, runner);
    for (const runner of this.computerProviders.values()) this.engines.attach(runner.engine());
    this.delivery.pump();
  }
  attachHarness(service: HarnessService, dispatcher: HarnessDispatcher): void {
    this.harness = service;
    this.selections?.attachHarness(service);
    this.engines.attach(
      harnessEngine({ service, dispatcher, conversation: this.conversation }, this.options, {
        activity: (notice): void => {
          this.listeners.activity(notice);
        },
        finished: (event, text, ok): void => {
          this.requests.finished(event, text, ok);
        },
      }),
    );
    this.titles?.backfill();
    this.delivery.pump();
  }
  attachMediaNotes(notes: Pick<MediaNotes, 'ensure' | 'later'>): void {
    this.files.attachMediaNotes(notes);
  }
  attachLedger(ledger: LedgerRollup): () => void {
    const { store } = this.options;
    return ledger.rollup(costRolledUp(store));
  }
  onFinished(listener: TurnEnded): () => void {
    return this.listeners.onFinished(listener);
  }
  onActivity(listener: TurnActivityListener): () => void {
    return this.listeners.onActivity(listener);
  }
  private ended(event: StoredEvent, text: string, ok: boolean): void {
    this.coordination.finished(event, text, ok);
    this.listeners.finished(event, text, ok);
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
  attachAuxiliaries(): void {
    this.titles = assistantAuxiliaries(this.options, this.engines, (listener) =>
      this.onFinished(listener),
    );
  }
  stop(): void {
    this.delivery.stop();
    for (const runner of this.computerProviders.values()) runner.stop();
    this.selections?.stop();
  }
  onVoiceResult(handler: VoiceResultHandler): void {
    this.voiceResult = handler;
  }
  settings(): AssistantSettings {
    return this.options.store.assistantChat.settings();
  }
  status(): AssistantStatus {
    return { settings: legacyAssistantSettings(this.settings()), ...RETIRED_STATUS_FIELDS };
  }
  update(change: AssistantSettingsChange): Promise<AssistantStatus> {
    this.options.store.assistantChat.saveSettings(patchAssistantSettings(this.settings(), change));
    this.delivery.pump();
    this.publisher.publish();
    return Promise.resolve(this.status());
  }
  messages(chatId: string, before: string | undefined, limit: number): AssistantMessageRow[] {
    return this.options.store.assistantChat.messages({ chatId, before, limit });
  }
  remove(owner: ChatOwner, ids: readonly string[]): Promise<void> {
    return removeConversationMessages(
      { store: this.options.store, files: this.files, engines: this.engines },
      owner,
      ids,
    );
  }
  createChat(owner: ChatOwner, input: AiChatNew): AiChatRow {
    return this.chats.create(owner, input);
  }
  removeChat(
    owner: ChatOwner,
    chatId: string,
    admit?: RemovalAdmission,
    inactiveOnly = false,
  ): Promise<void> {
    const { chats, engines, delivery } = this;
    return removeChatTree({ chats, engines, delivery, admit, inactiveOnly }, owner, chatId);
  }
  branchChat(owner: ChatOwner, chatId: string, body: AiChatBranch): Promise<AiChatRow> {
    this.engines.forMutation(this.chats.own(owner, chatId), owner.role);
    return this.branches.branch(owner, chatId, body);
  }

  searchChats(owner: ChatOwner, query: AiChatSearch): AiChatHit[] {
    return this.chats.search(owner, query);
  }

  async updateChat(owner: ChatOwner, chatId: string, change: AiChatChange): Promise<AiChatRow> {
    const before = this.chats.own(owner, chatId);
    const selected = selectChatEngineChange(
      { selections: this.selections, harness: this.harness, owner },
      before,
      change,
    );
    admitHarnessChange(before, selected);
    const altersScope = selected.engine !== undefined || selected.tools !== undefined;
    if (altersScope) this.engines.forMutation(before, owner.role);
    const permissionOnly = codexPermissionChange(before, selected);
    if (this.engineStatus(before)?.state === 'working' && altersScope && !permissionOnly)
      throw new ApiError(
        'conflict',
        'Stop the running turn before changing its engine or tool scope.',
      );
    if (selected.engine !== undefined) this.selections?.validate(selected.engine, owner.role);
    if (selected.engine !== undefined)
      await this.computerProviders.bindingChanged(before, selected.engine);
    await closeReplacedHarness(this.engines, owner, before, selected);
    this.coordination.assertChange(before, selected);
    const chat = this.chats.update(owner, chatId, selected);
    this.delivery.pump();
    return Promise.resolve(chat);
  }

  controlAgentRun(run: AiAgentRun, control: z.infer<typeof AI_AGENT_RUN_CONTROL>): Promise<void> {
    return this.computerProviders.controlRun(
      {
        store: this.options.store,
        interrupt: (chat) => this.interrupt({ profileId: chat.profile_id, role: 'owner' }, chat.id),
      },
      run,
      control,
    );
  }

  engineStatus(chat: AiChatRow): EngineStatus | null {
    return this.engines.engineOf(chat)?.status(chat) ?? null;
  }

  async compact(owner: ChatOwner, chatId: string, clientId?: string): Promise<boolean> {
    const chat = this.chats.own(owner, chatId);
    const engine = this.engines.forMutation(chat, owner.role);
    if (engine?.status(chat).state === 'working')
      throw new ApiError('conflict', 'Wait for active work to finish before compacting.');
    return (await engine?.compact(chat, clientId)) ?? false;
  }

  async interrupt(owner: ChatOwner, chatId: string): Promise<void> {
    const chat = this.chats.own(owner, chatId);
    const engine = this.engines.forMutation(chat, owner.role);
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
    this.engines.forMutation(chat, owner.role);
    return this.requests.send(sender, body, chat);
  }

  async retry(
    owner: ChatOwner,
    target: { readonly chatId: string; readonly messageId: string },
    from: AiRetryFrom,
    clientId?: string | null,
  ): Promise<AssistantMessageRow> {
    const chat = mutableChat(this.chats, this.engines, owner, target.chatId);
    const message = this.options.store.assistantChat.message(target.messageId);
    if (message.chat_id === chat.id && message.state === from)
      await this.rewriteAsked(owner, chat, message);
    return this.requests.retry(chat, target.messageId, from, clientId);
  }

  async edit(
    owner: ChatOwner,
    target: { readonly chatId: string; readonly messageId: string },
    body: AiEdit,
    clientId?: string | null,
  ): Promise<AssistantMessageRow> {
    const chat = mutableChat(this.chats, this.engines, owner, target.chatId);
    const message = this.options.store.assistantChat.message(target.messageId);
    if (message.chat_id === chat.id && (message.state === 'answered' || message.state === 'failed'))
      await this.rewriteAsked(owner, chat, message, body);
    return this.requests.edit(chat, target.messageId, body, clientId);
  }

  private async rewriteAsked(
    owner: ChatOwner,
    chat: AiChatRow,
    message: AssistantMessageRow,
    edit?: AiEdit,
  ): Promise<void> {
    this.requests.assertReplay(chat, message.id, edit);
    const engine = this.engines.forMutation(chat, owner.role);
    await engine?.historyChanged(chat, owner);
    engine?.historyRemoved?.(chat, [
      message,
      ...this.options.store.assistantChat.repliesTo(message.id),
    ]);
  }

  post(body: AssistantPost, local: boolean): Promise<AssistantMessageRow> {
    return this.requests.post(body, local, () => ownerProfile(this.options.store));
  }
}
