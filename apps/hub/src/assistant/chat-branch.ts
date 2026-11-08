import { admitChatExecution, admitNativeEngine } from './native-helpers';
import { nativeForkIntent } from '../harness/forks';
import {
  helperDialogueOf,
  AI_CHAT_TITLE_MAX,
  ApiError,
  type AiChatBranch,
  type AiChatRow,
  type AssistantMessageRow,
  type Engine,
} from '@smarteverything/domain';
import { summaryOf, type StoredAttachment } from '../store/repositories/assistant-chat';
import type { Store } from '../store/store';
import type { ChatDirectory, ChatOwner } from './chat-directory';
import { isHelperDialogueMirror } from './delegation/relay-speaker';
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

  async branch(
    owner: ChatOwner,
    chatId: string,
    body: AiChatBranch,
    allowStandalone = false,
  ): Promise<AiChatRow> {
    const source = this.chats.own(owner, chatId);
    admitChatExecution(source);
    if (
      source.native_admission === 'standalone' &&
      (!allowStandalone || owner.confinedTo !== undefined)
    )
      throw new ApiError('forbidden', 'Only an unconfined owner client can branch a native chat.');
    const engine = this.engineOf(owner, source, body);
    const path = this.path(source, body.messageId);
    const copies = await this.copiedFiles(path);
    const write = source.engine.kind === 'dsh' ? this.store.durableWrite : this.store.write;
    return write(() => this.build(source, { ...body, engine }, path, copies));
  }

  private engineOf(owner: ChatOwner, source: AiChatRow, body: AiChatBranch): Engine {
    const engine =
      body.engine === undefined ? source.engine : this.chats.complete(owner.profileId, body.engine);
    const standalone = source.native_admission === 'standalone';
    if (standalone && engine.kind !== source.engine.kind)
      throw new ApiError('conflict', 'A branch must keep its native chat engine family.');
    admitNativeEngine(engine, standalone);
    if (standalone) this.chats.validateStandalone(engine, owner);
    else if (body.engine !== undefined) this.chats.validateEngine(engine, owner);
    return engine.kind === 'dsh' ? { ...engine, session_id: null } : engine;
  }

  private path(source: AiChatRow, messageId: string): AssistantMessageRow[] {
    const message = this.store.assistantChat.message(messageId);
    if (message.chat_id !== source.id) {
      throw new ApiError('invalid_request', 'That message is not in this chat.');
    }
    if (helperDialogueOf(message) !== undefined)
      throw new ApiError('invalid_request', 'Select a coordinator turn as the branch point.');
    const rows = this.store.assistantSearch
      .upTo(source.id, messageId)
      .filter((row) => !isHelperDialogueMirror(row));
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
    body: Omit<AiChatBranch, 'engine'> & { readonly engine: Engine },
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
      engine: body.engine,
      ...(source.native_admission === 'standalone' ? { nativeAdmission: 'standalone' } : {}),
      tools: source.tools,
      branchMessageId: body.messageId,
    });
    if (branch.engine.kind === 'dsh') nativeForkIntent(this.store, source, branch, body.messageId);
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
        quote:
          row.quote === null
            ? null
            : { ...row.quote, message_id: made.get(row.quote.message_id) ?? row.quote.message_id },
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
