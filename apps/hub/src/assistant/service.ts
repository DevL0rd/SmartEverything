import { attachHarnessReferences } from '../harness/reference-delivery';
import { type ReferenceSubmissions, type ReplayActor } from './reference-submission';
import { ReferenceService } from '../references/service';
import { claudeReferences } from '../references/claude';
import { ProjectFilesService } from '../projects/service';
import { removeChatTree, type RemovalAdmission } from './remove-chat-tree';
import { updateChat } from './chat-update';
import type { z } from 'zod';
import { Logger } from '@smarteverything/logging';
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
import type { Coordination } from './coordination/asks';
import { costRolledUp } from './cost-rollup';
import type { AssistantDelivery } from './delivery';
import { removeConversationMessages } from './remove-messages';
import { compactChat, interruptChat } from './chat-run-control';
import { deliveryPorts } from './delivery-ports';
import { MessageEdits } from './message-edits';
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
const log = new Logger('hub.assistant');
export class AssistantService {
  readonly files: AssistantFiles;
  readonly voice: VoiceResponder;
  readonly chats: ChatDirectory;
  readonly branches: ChatBranches;
  readonly projects: ProjectFilesService;
  readonly references: ReferenceService;
  readonly coordination: Coordination;
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
  private titles: ChatTitles | null = null;
  private voiceResult: VoiceResultHandler | null = null;
  private readonly publisher = new StatusPublisher(() => {
    this.options.announce(this.status());
  });
  private readonly listeners = new TurnListeners();
  constructor(private readonly options: AssistantServiceOptions) {
    const { store } = options;
    this.projects = new ProjectFilesService(options.dataDirectory);
    this.references = new ReferenceService(store, this.projects);
    this.files = assistantFiles(options, this.projects);
    this.conversation = new ConversationLog(store);
    this.chats = assistantChats(options, this.files, () => this.selections, this.projects);
    this.branches = new ChatBranches(store, this.files, this.chats);
    this.engines = new EngineRegistry(store);
    this.delivery = assistantDelivery(
      options,
      this.engines,
      deliveryPorts({
        options,
        conversation: this.conversation,
        publisher: this.publisher,
        coordination: () => this.coordination,
        ended: this.ended.bind(this),
      }),
    );
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
    this.submissions = this.requests.referenceSubmissions(this.references, this.engines);
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
    log.debug('turn.requested', {
      chatId: chat.id,
      profileId: input.profileId,
      textLength: input.text.length,
      source: input.origin.source,
      newChat: input.chatId === undefined,
    });
    return { chatId: chat.id, eventId: this.requests.turn(chat, input.text, input.origin) };
  }
  admitDelivery(admit: (event: StoredEvent) => boolean): () => void {
    return this.delivery.admission(admit);
  }
  start(): void {
    log.info('service.starting', { engines: this.computerProviders.size });
    this.coordination.restart();
    this.conversation.interrupted(HUB_RESTARTED);
    this.delivery.pump();
  }
  attachComputerAi(directory: ComputerAiDirectory): void {
    this.selections = new EngineSelections(this.options.store, directory, this.options.log);
    this.references.attachNative(['claude'], claudeReferences(directory));
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
    log.info('engine.attached', { kind: 'computer', runners: [...runners.keys()].join(',') });
    this.delivery.pump();
  }
  attachHarness(service: HarnessService, dispatcher: HarnessDispatcher): void {
    this.harness = attachHarnessReferences(service, this.references);
    service.onMachineChanged((chat, text) => {
      this.conversation.note(chat, 'SmartEverything', text, null);
    });
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
    log.info('engine.attached', { kind: 'harness' });
    this.titles?.backfill();
    this.delivery.pump();
  }
  attachMediaNotes(notes: Pick<MediaNotes, 'ensure' | 'later' | 'wants'>): void {
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
  attachAuxiliaries(parts: SideParts): void {
    this.titles = assistantAuxiliaries(this.options, parts, (listener) =>
      this.onFinished(listener),
    );
  }
  stop(): void {
    log.info('service.stopping', { engines: this.computerProviders.size });
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
    log.info('settings.updated', { fields: Object.keys(change).join(',') });
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
    log.info('chat.removing', { chatId, profileId: owner.profileId, inactiveOnly });
    return removeChatTree({ chats, engines, delivery, admit, inactiveOnly }, owner, chatId);
  }
  branchChat(owner: ChatOwner, chatId: string, body: AiChatBranch): Promise<AiChatRow> {
    this.engines.forMutation(this.chats.own(owner, chatId), owner.role);
    return this.branches.branch(owner, chatId, body);
  }
  searchChats(owner: ChatOwner, query: AiChatSearch): AiChatHit[] {
    return this.chats.search(owner, query);
  }
  updateChat(owner: ChatOwner, chatId: string, change: AiChatChange): Promise<AiChatRow> {
    const { chats, engines, delivery, coordination, computerProviders, selections, harness } = this;
    const ports = {
      chats,
      engines,
      delivery,
      coordination,
      computerProviders,
      selections,
      harness,
    };
    return updateChat(ports, owner, chatId, change);
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

  send(sender: Sender, body: AssistantNewMessage, chatId?: string): AssistantMessageRow {
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
