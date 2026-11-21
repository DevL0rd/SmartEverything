import { Logger } from '@smarteverything/logging';
import type { AiChatRow, AiEdit, AiRetryFrom, AssistantMessageRow } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { AssistantDelivery } from './delivery';
import type { ConversationLog } from './conversation-log';
import type { AssistantFiles } from './files';
import { admitChatExecution } from './native-helpers';
import { queuedLog } from './request-events';
import { authorityScope } from './turn-authority';
import type { Rearmed } from './message-replay-units';

const log = new Logger('hub.assistant-replay');

export interface ReplayDeps {
  readonly store: Store;
  readonly conversation: ConversationLog;
  readonly files: AssistantFiles;
  readonly delivery: () => AssistantDelivery;
}

export class MessageReplay {
  constructor(private readonly deps: ReplayDeps) {}

  async retry(
    chat: AiChatRow,
    messageId: string,
    from: AiRetryFrom,
    clientId?: string | null,
  ): Promise<AssistantMessageRow> {
    admitChatExecution(chat);
    const { store } = this.deps;
    return await this.replayed(
      'retry',
      chat.id,
      messageId,
      await store.host.write('assistantReplayRetry', {
        ...this.context(chat, messageId, clientId),
        from,
      }),
    );
  }

  async edit(
    chat: AiChatRow,
    messageId: string,
    body: AiEdit,
    clientId?: string | null,
  ): Promise<AssistantMessageRow> {
    admitChatExecution(chat);
    const { store } = this.deps;
    return await this.replayed(
      'edit',
      chat.id,
      messageId,
      await store.host.write('assistantReplayEdit', {
        ...this.context(chat, messageId, clientId),
        body,
      }),
    );
  }

  assertReplay(chat: AiChatRow, messageId: string, edit?: AiEdit): Promise<void> {
    return this.deps.store.host.read('assistantReplayCheck', { chat, messageId, edit });
  }

  private context(
    chat: AiChatRow,
    messageId: string,
    clientId: string | null | undefined,
  ): {
    readonly chat: AiChatRow;
    readonly messageId: string;
    readonly clientId: string | null | undefined;
    readonly held: ReturnType<Store['live']['chatWork']['holds']['held']>;
    readonly scope: ReturnType<typeof authorityScope>;
  } {
    return {
      chat,
      messageId,
      clientId,
      held: this.deps.store.live.chatWork.holds.held(),
      scope: authorityScope(),
    };
  }

  private async replayed(
    kind: 'retry' | 'edit',
    chatId: string,
    messageId: string,
    { row, files, event }: Rearmed,
  ): Promise<AssistantMessageRow> {
    if (event !== null) queuedLog(event, 'given');
    log.info('replay.settled', {
      kind,
      chatId,
      messageId,
      queued: event !== null,
      state: row.state,
      removedFiles: files.length,
    });
    await this.deps.files.remove(files);
    if (event !== null) {
      this.deps.delivery().added();
    }
    return row;
  }
}
