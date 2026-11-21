import { attachHarnessReferences } from '../harness/reference-delivery';
import { type ReferenceSubmissions, type ReplayActor } from './reference-submission';
import { ReferenceService } from '../references/service';
import { claudeReferences } from '../references/claude';
import { ProjectFilesService } from '../projects/service';
import { removeChatTree, type RemovalAdmission } from './remove-chat-tree';
import { updateChat } from './chat-update';
import type { z } from 'zod';
import type { NewChat } from '../store/repositories/ai-chat-input';
import { Logger, background } from '@smarteverything/logging';
import { harnessEngine } from './engines/dsh/wiring';
import type { HarnessService } from '../harness/service';
import type { HarnessDispatcher } from '@smarteverything/harness/process';
import type { AiAgentRun, AI_AGENT_RUN_CONTROL } from '@smarteverything/domain';
import {
  assistantFiles,
  assistantDelivery,
  assistantRequests,
  assistantChats,
  assistantDelegation,
  assistantRepair,
} from './service-routing';
import { assistantVoice } from './service-voice';
import {
  patchAssistantSettings,
  legacyAssistantSettings,
  RETIRED_STATUS_FIELDS,
  type AiChatChangeRequest,
  type AiChatHit,
  type AiChatNew,
  type AiChatRow,
  type AiChatSearch,
  type AiEdit,
  type AiRetryFrom,
  type AssistantMessageRow,
  type AssistantReaction,
  type AssistantReactionChange,
  type AssistantNewMessage,
  type AssistantPost,
  type AssistantSettings,
  type AssistantSettingsChange,
  type AssistantStatus,
  type ChatActivityNotice,
} from '@smarteverything/domain';
import type { ComputerAiDirectory } from '../computers/ai-directory';
import { assistantAuxiliaries } from './auxiliary-wiring';
import type { SideParts } from './side-completion';
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
import { ownerProfileOf } from '../transcripts/owner';
import { TurnListeners } from './turn-listeners';
import { ConversationLog } from './conversation-log';
import { HUB_RESTARTED } from './interruption';
import type { Delegation } from './delegation/delegation';
import type { AssistantDelivery } from './delivery';
import { removeConversationMessages } from './remove-messages';
import { setMessageReaction } from './message-reactions';
import type { Caller } from '../server/auth';
import { compactChat, interruptChat } from './chat-run-control';
import { deliveryPorts } from './delivery-ports';
import { MessageEdits } from './message-edits';
import type { EngineStatus } from './engines/engine';
import { EngineRegistry } from './engines/registry';
import type { RepairDispatch } from './repair-dispatch';
import type { AssistantFiles } from './files';
import type { AssistantRequests, InboundTurn, Sender } from './requests';
import type { TitleService } from './titles/title-service';
import type { MemoryLearner } from '../memory/learner';
import type { VoiceResponder, VoiceResultHandler } from './voice-link';
import type {
  AssistantServiceOptions,
  TurnActivityListener,
  TurnEnded,
  TurnRequest,
} from './service-contract';
export type * from './service-contract';
export type { Sender } from './requests';
type MessagesRead = Promise<AssistantMessageRow[]>;
const log = new Logger('hub.assistant');
export class AssistantService {
  readonly files: AssistantFiles;
  readonly voice: VoiceResponder;
  readonly chats: ChatDirectory;
  readonly branches: ChatBranches;
  readonly projects: ProjectFilesService;
  readonly references: ReferenceService;
  readonly delegation: Delegation;
  readonly repair: RepairDispatch;
  private readonly conversation: ConversationLog;
  private readonly delivery: AssistantDelivery;
  private readonly engines: EngineRegistry;
  private readonly requests: AssistantRequests;
  private readonly edits: MessageEdits;
  readonly submissions: ReferenceSubmissions;
  selections: EngineSelections | null = null;
  claude: ClaudeRunner | null = null;
  readonly computerProviders = new ComputerProviders();
  private tools: ToolHub | null = null;
  private harness: HarnessService | null = null;
  private titles: TitleService | null = null;
  private learner: MemoryLearner | null = null;
  private voiceResult: VoiceResultHandler | null = null;
  private readonly publisher = new StatusPublisher(() => {
    this.options.announce(this.status());
  });
  private readonly listeners = new TurnListeners();
  constructor(private readonly options: AssistantServiceOptions) {
    const { store } = options;
    this.projects = new ProjectFilesService(options.layout, store.live.chats);
    this.references = new ReferenceService(store, this.projects);
    this.files = assistantFiles(options, this.projects);
    this.conversation = new ConversationLog(store);
    this.chats = assistantChats(options, this.files, () => this.selections, this.projects);
    this.branches = new ChatBranches(store, this.files, this.chats);
    this.repair = assistantRepair(options, this.chats, () => this.delivery);
    this.engines = new EngineRegistry(store);
    this.delivery = assistantDelivery(
      options,
      this.engines,
      deliveryPorts({
        options,
        conversation: this.conversation,
        publisher: this.publisher,
        delegation: () => this.delegation,
        ended: this.ended.bind(this),
      }),
    );
    this.delegation = assistantDelegation(options, {
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
        done: this.ended.bind(this),
      },
    );
    const { requests, references, engines, delegation } = this;
    this.submissions = requests.referenceSubmissions(references, engines, delegation);
    this.edits = new MessageEdits({
      store,
      chats: this.chats,
      engines: this.engines,
      submissions: this.submissions,
      requests: this.requests,
    });
    this.voice = this.voiceOf();
  }
  private voiceOf(): VoiceResponder {
    return assistantVoice({
      store: this.options.store,
      engines: this.engines,
      chats: this.chats,
      requests: this.requests,
      afterCall: (chatId, transcript, messageId): void => {
        this.titles?.afterCall(chatId, transcript);
        this.learner?.afterCall(chatId, messageId);
      },
    });
  }
  async activity(profileId: string): Promise<ChatActivityNotice[]> {
    return [
      ...(await this.engines.activity(profileId)),
      ...[...this.computerProviders.values()].flatMap((runner) => runner.activity(profileId)),
    ];
  }
  previewError(
    id: string,
    scope: { readonly chatId: string; readonly profileId: string; readonly clientId: string },
    text: string,
  ): Promise<void> {
    return this.requests.previewError(id, scope, text);
  }
  runTurn(input: TurnRequest): Promise<{ chatId: string; eventId: string }> {
    return this.requests.runTurn(input);
  }
  admitDelivery(admit: (event: StoredEvent) => boolean): () => void {
    return this.delivery.admission(admit);
  }
  start(): void {
    log.info('service.starting', { engines: this.computerProviders.size });
    background(this.delegation.restart(), 'service.delegation_restart_failed');
    background(this.conversation.interrupted(HUB_RESTARTED), 'service.interrupt_failed');
    this.delivery.pump();
    void this.files.backfillLevels().catch((cause: unknown) => {
      log.warn('levels.backfill_failed', { cause });
    });
  }
  attachComputerAi(directory: ComputerAiDirectory): void {
    this.selections = new EngineSelections(this.options.store, directory, this.options.log);
    this.references.attachNative(['claude'], claudeReferences(directory));
    const runners = computerRunners(this.options, directory, {
      conversation: this.conversation,
      files: this.files,
      tools: (): ToolHub | null => this.tools,
      requests: this.requests,
    });
    this.claude = runners.get('claude') ?? null;
    for (const [runtime, runner] of runners) this.computerProviders.set(runtime, runner);
    for (const runner of this.computerProviders.values()) this.engines.attach(runner.engine());
    log.info('engine.attached', { kind: 'computer', runners: [...runners.keys()].join(',') });
    this.delivery.pump();
  }
  attachHarness(service: HarnessService, dispatcher: HarnessDispatcher): void {
    this.harness = attachHarnessReferences(service, this.references);
    this.engines.attach(
      harnessEngine({ service, dispatcher, conversation: this.conversation }, this.options, {
        activity: (notice): void => {
          this.listeners.activity(notice);
        },
        finished: (event, text, ok) => this.requests.finished(event, text, ok),
      }),
    );
    log.info('engine.attached', { kind: 'harness' });
    this.titles?.backfill();
    this.delivery.pump();
  }
  attachMediaNotes(notes: Pick<MediaNotes, 'ensure' | 'later' | 'wants'>): void {
    this.files.attachMediaNotes(notes);
  }
  onFinished(listener: TurnEnded): () => void {
    return this.listeners.onFinished(listener);
  }
  onActivity(listener: TurnActivityListener): () => void {
    return this.listeners.onActivity(listener);
  }
  private ended(event: StoredEvent, text: string, ok: boolean): void {
    this.delegation.ended(event, text, ok);
    this.listeners.finished(event, text, ok);
  }
  inbound(turn: InboundTurn): Promise<{ eventId: string; messageId: string }> {
    return this.requests.inbound(turn);
  }
  systemNote(chatId: string, text: string, author: string): Promise<AssistantMessageRow> {
    return this.conversation.noteIn(chatId, author, text);
  }
  attachTools(tools: ToolHub): void {
    this.tools = tools;
  }
  attachAuxiliaries(parts: SideParts, learner: MemoryLearner): void {
    this.learner = learner;
    this.titles = assistantAuxiliaries(this.options, parts, this.onFinished.bind(this), learner);
  }
  async stop(): Promise<void> {
    log.info('service.stopping', { engines: this.computerProviders.size });
    this.delivery.stop();
    this.selections?.stop();
    await Promise.all([...this.computerProviders.values()].map((runner) => runner.stop()));
  }
  onVoiceResult(handler: VoiceResultHandler): void {
    this.voiceResult = handler;
  }
  settings(): AssistantSettings {
    return this.options.store.live.home.assistant.read();
  }
  status(): AssistantStatus {
    return { settings: legacyAssistantSettings(this.settings()), ...RETIRED_STATUS_FIELDS };
  }
  async update(change: AssistantSettingsChange): Promise<AssistantStatus> {
    await this.options.store.live.home.assistant.save(
      patchAssistantSettings(this.settings(), change),
    );
    if (change.name !== undefined) await this.chats.retitleConversations();
    log.info('settings.updated', { fields: Object.keys(change).join(',') });
    this.delivery.pump();
    this.publisher.publish();
    return this.status();
  }
  messages(chatId: string, before: string | undefined, limit: number): MessagesRead {
    return this.options.store.host.call('assistantChat', 'messages', { chatId, before, limit });
  }
  react(
    caller: Caller,
    target: { readonly chatId: string; readonly messageId: string },
    change: AssistantReactionChange,
  ): Promise<readonly AssistantReaction[]> {
    return setMessageReaction(
      { store: this.options.store, chats: this.chats, engines: this.engines },
      caller,
      target,
      change,
    );
  }
  remove(owner: ChatOwner, ids: readonly string[]): Promise<void> {
    return removeConversationMessages(
      { store: this.options.store, files: this.files, engines: this.engines },
      owner,
      ids,
    );
  }
  createChat(owner: ChatOwner, input: AiChatNew, allowStandalone = false): Promise<AiChatRow> {
    return this.chats.create(owner, input, allowStandalone);
  }
  preparedChat(owner: ChatOwner, input: AiChatNew): Promise<NewChat> {
    return this.chats.prepare(owner, input);
  }
  removeChat(
    owner: ChatOwner,
    chatId: string,
    admit?: RemovalAdmission,
    inactiveOnly = false,
  ): Promise<void> {
    const { chats, engines, delivery } = this;
    log.info('chat.removing', { chatId, profileId: owner.profileId, inactiveOnly });
    return removeChatTree({ chats, engines, delivery, admit, inactiveOnly }, owner, chatId);
  }
  async branchChat(...input: Parameters<ChatBranches['branch']>): Promise<AiChatRow> {
    const [owner, chatId] = input;
    this.engines.forMutation(await this.chats.own(owner, chatId), owner.role);
    return await this.branches.branch(...input);
  }
  searchChats(owner: ChatOwner, query: AiChatSearch): Promise<AiChatHit[]> {
    return this.chats.search(owner, query);
  }
  updateChat(owner: ChatOwner, chatId: string, change: AiChatChangeRequest): Promise<AiChatRow> {
    const { chats, engines, delivery, delegation, computerProviders, selections, harness } = this;
    return updateChat(
      { chats, engines, delivery, delegation, computerProviders, selections, harness },
      owner,
      chatId,
      change,
    );
  }

  controlAgentRun(
    run: AiAgentRun,
    control: z.infer<typeof AI_AGENT_RUN_CONTROL>,
    sender: Sender,
  ): Promise<void> {
    return this.computerProviders.controlRun(
      {
        store: this.options.store,
        interrupt: (chat) => this.interrupt({ profileId: chat.profile_id, role: 'owner' }, chat.id),
        send: async (chat, text): Promise<void> => {
          await this.send(sender, { text, attachments: [] }, chat.id);
        },
      },
      run,
      control,
    );
  }

  engineStatus(chat: AiChatRow): EngineStatus | null {
    return this.engines.engineOf(chat)?.status(chat) ?? null;
  }

  compact(owner: ChatOwner, chatId: string, clientId?: string): Promise<boolean> {
    return compactChat(
      { chats: this.chats, engines: this.engines, delivery: this.delivery },
      owner,
      chatId,
      clientId,
    );
  }

  interrupt(owner: ChatOwner, chatId: string): Promise<void> {
    return interruptChat(
      { chats: this.chats, engines: this.engines, delivery: this.delivery },
      owner,
      chatId,
    );
  }

  send(sender: Sender, body: AssistantNewMessage, chatId?: string): Promise<AssistantMessageRow> {
    return this.submissions.plain(sender, body, chatId);
  }
  retry(
    owner: ChatOwner,
    target: { readonly chatId: string; readonly messageId: string },
    from: AiRetryFrom,
    actor?: ReplayActor,
  ): Promise<AssistantMessageRow> {
    return this.edits.retry(owner, target, from, actor);
  }

  edit(
    owner: ChatOwner,
    target: { readonly chatId: string; readonly messageId: string },
    body: AiEdit,
    actor?: ReplayActor,
  ): Promise<AssistantMessageRow> {
    return this.edits.edit(owner, target, body, actor);
  }

  post(body: AssistantPost, local: boolean, actor: ChatOwner): Promise<AssistantMessageRow> {
    return this.requests.post(body, local, () => ownerProfileOf(this.options.store), actor);
  }
}
