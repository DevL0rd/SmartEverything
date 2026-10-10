import {
  AI_CHAT_TITLE_MAX,
  ApiError,
  type AiChatBranch,
  type AiChatRow,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import { summaryOf, type StoredAttachment } from '../store/repositories/assistant-chat';
import type { Store } from '../store/store';
import type { ChatDirectory, ChatOwner } from './chat-directory';
import type { AssistantFiles } from './files';

const PENDING_STATES: ReadonlySet<AssistantMessageRow['state']> = new Set([
  'queued',
  'delivered',
  'working',
]);

const BRANCH_PREFIX = 'Branch · ';

function pending(rows: readonly AssistantMessageRow[]): boolean {
  return rows.some((row) => row.role !== 'system' && PENDING_STATES.has(row.state));
}

export class ChatBranches {
  constructor(
    private readonly store: Store,
    private readonly files: AssistantFiles,
    private readonly chats: ChatDirectory,
  ) {}

  async branch(owner: ChatOwner, chatId: string, body: AiChatBranch): Promise<AiChatRow> {
    const source = this.chats.own(owner, chatId);
    const path = this.path(source, body.messageId);
    const copies = await this.copiedFiles(path);
    return this.store.write(() => this.build(source, body, path, copies));
  }

  private path(source: AiChatRow, messageId: string): AssistantMessageRow[] {
    const message = this.store.assistantChat.message(messageId);
    if (message.chat_id !== source.id) {
      throw new ApiError('invalid_request', 'That message is not in this chat.');
    }
    const rows = this.store.assistantSearch.upTo(source.id, messageId);
    if (pending(rows)) {
      throw new ApiError(
        'conflict',
        'The AI is still working on this chat; wait for the reply or stop it before branching.',
      );
    }
    return rows;
  }

  private async copiedFiles(
    rows: readonly AssistantMessageRow[],
  ): Promise<Map<string, StoredAttachment>> {
    const ids = rows.flatMap((row) => row.attachments.map((file) => file.id));
    const copies = await Promise.all(
      ids.map(
        async (id) => [id, await this.files.copy(this.store.assistantChat.attachment(id))] as const,
      ),
    );
    return new Map(copies);
  }

  private build(
    source: AiChatRow,
    body: AiChatBranch,
    path: readonly AssistantMessageRow[],
    copies: ReadonlyMap<string, StoredAttachment>,
  ): AiChatRow {
    const branch = this.store.aiChats.create({
      profileId: source.profile_id,
      kind: 'chat',
      title: body.title ?? `${BRANCH_PREFIX}${source.title}`.slice(0, AI_CHAT_TITLE_MAX),
      icon: source.icon,
      parentId: source.id,
      sourceKey: null,
      engine: source.engine,
      tools: source.tools,
      branchMessageId: body.messageId,
    });
    const made = new Map<string, string>();
    for (const row of path) {
      made.set(row.id, this.copy(row, branch.id, made, copies));
    }
    this.store.aiChats.touched(branch.id, 0);
    return this.store.aiChats.update(branch.id, { read: true });
  }

  private copy(
    row: AssistantMessageRow,
    chatId: string,
    made: ReadonlyMap<string, string>,
    copies: ReadonlyMap<string, StoredAttachment>,
  ): string {
    const files = row.attachments.flatMap((file) => copies.get(file.id) ?? []);
    const added = this.store.assistantChat.addMessage(
      {
        ...row,
        chat_id: chatId,
        reply_to: row.reply_to === null ? null : (made.get(row.reply_to) ?? null),
        attachments: files.map(summaryOf),
        cost_micros: 0,
        client_message_id: null,
      },
      { createdAt: row.created_at, updatedAt: row.updated_at },
    );
    this.store.assistantChat.attachTo(
      added.id,
      files.map((file) => file.id),
    );
    return added.id;
  }
}
