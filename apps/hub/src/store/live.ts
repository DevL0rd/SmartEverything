import type { AiChatRow } from '@smarteverything/domain';
import type { ChangeFeed } from './feed';
import type { StoreHost } from './host/host';
import { ChatWorkHolds, assertChatWorkState } from './repositories/ai-chat-removal-hold';
import type { NewChat } from './repositories/ai-chat-input';
import { AiEngineDefaultsWatch } from './repositories/ai-engine-defaults';
import { AttachmentCleanup } from './repositories/assistant-files';
import type { NewEvent, StoredEvent } from './repositories/assistant-events';
import { PluginLiveStreams } from './plugin-live-streams';
import { AiModelsState } from './ai-models-state';
import { ComputerAccessState } from './computer-access-state';
import { ComputerAiState } from './computer-ai-state';
import { HomeMirror } from './home-mirror';
import { AccessMirror } from './access-mirror';
import { PluginPeopleState } from './plugin-people-state';
import { DshSessionWrites } from './repositories/dsh-session-writes';
import { SpeechReaders } from './repositories/speech';
import { UsageSpend } from '../ledger/usage-spend';
import { ChatMirror } from './chat-mirror';

export class ChatWorkGate {
  readonly holds = new ChatWorkHolds();

  constructor(
    private readonly chats: Pick<ChatMirror, 'find'>,
    private readonly host: StoreHost,
  ) {}

  assertWorkAllowed(chatId: string, mode: 'read' | 'write' = 'write'): void {
    const chat = this.chats.find(chatId);
    assertChatWorkState(
      chat === undefined
        ? undefined
        : { deletion_state: chat.deletion_state, native_admission: chat.native_admission ?? null },
      mode,
    );
    this.holds.assertWork(chatId);
  }

  create(input: NewChat): Promise<AiChatRow> {
    this.holds.assertSubagentCreation(input);
    return this.host.call('aiChats', 'create', input);
  }

  queue(input: NewEvent): Promise<StoredEvent> {
    this.holds.assertQueued(input.chat_id);
    return this.host.call('assistantEvents', 'add', input);
  }

  holdRemoval(ids: readonly string[], work: () => Promise<void>): Promise<void> {
    return this.holds.holdRemoval(ids, work);
  }

  holdQueued(ids: readonly string[], work: () => Promise<void>): Promise<void> {
    return this.holds.holdQueued(ids, work);
  }
}

export class StoreLive {
  readonly chatWork: ChatWorkGate;
  readonly attachments = new AttachmentCleanup();
  readonly engineDefaults: AiEngineDefaultsWatch;
  readonly dshSessions: DshSessionWrites;
  readonly speechReaders = new SpeechReaders();
  readonly pluginStreams: PluginLiveStreams;
  readonly computers: ComputerAiState;
  readonly computerAccess: ComputerAccessState;
  readonly aiModels: AiModelsState;
  readonly home: HomeMirror;
  readonly access: AccessMirror;
  readonly pluginPeople: PluginPeopleState;
  readonly usage: UsageSpend;
  readonly chats: ChatMirror;

  constructor(host: StoreHost, feed: ChangeFeed, now: () => Date) {
    this.chats = new ChatMirror(feed, host);
    this.chatWork = new ChatWorkGate(this.chats, host);
    this.pluginStreams = new PluginLiveStreams(feed, host);
    this.computers = new ComputerAiState(feed, host);
    this.computerAccess = new ComputerAccessState(feed, host);
    this.aiModels = new AiModelsState(host);
    this.home = new HomeMirror(feed, host, this.computerAccess);
    this.access = new AccessMirror(feed, host);
    this.usage = new UsageSpend(feed, host, () => this.home.settings.read().time_zone, now);
    this.pluginPeople = new PluginPeopleState(feed, host);
    this.engineDefaults = new AiEngineDefaultsWatch(host);
    this.dshSessions = new DshSessionWrites(host, this.chatWork.holds);
  }
}
