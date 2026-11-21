import { admitChatExecution, admitNativeEngine } from './native-helpers';
import { planNativeFork } from '../harness/forks';
import {
  ApiError,
  type AiChatBranch,
  type AiChatRow,
  type AssistantMessageRow,
  type Engine,
} from '@smarteverything/domain';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import type { Store } from '../store/store';
import type { ChatDirectory, ChatOwner } from './chat-directory';
import type { AssistantFiles } from './files';
import type { BranchBuild } from './chat-branch-units';

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
    const source = await this.chats.own(owner, chatId);
    admitChatExecution(source);
    if (
      source.native_admission === 'standalone' &&
      (!allowStandalone || owner.confinedTo !== undefined)
    )
      throw new ApiError('forbidden', 'Only an unconfined owner client can branch a native chat.');
    const engine = this.engineOf(owner, source, body);
    const path = await this.store.host.read('assistantBranchPath', {
      sourceId: source.id,
      messageId: body.messageId,
    });
    const copies = await this.copiedFiles(path);
    const fork =
      engine.kind === 'dsh' ? await planNativeFork(this.store, source, body.messageId) : undefined;
    const build: BranchBuild = {
      source,
      title: body.title,
      messageId: body.messageId,
      engine,
      path,
      copies,
      fork,
      held: this.store.live.chatWork.holds.held(),
    };
    return source.engine.kind === 'dsh'
      ? await this.store.host.write('assistantNativeBranchBuild', build)
      : await this.store.host.write('assistantBranchBuild', build);
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

  private async copiedFiles(
    rows: readonly AssistantMessageRow[],
  ): Promise<(readonly [string, StoredAttachment])[]> {
    const ids = rows.flatMap((row) => row.attachments.map((file) => file.id));
    return await Promise.all(
      ids.map(
        async (id) =>
          [
            id,
            await this.files.copy(await this.store.host.call('assistantChat', 'attachment', id)),
          ] as const,
      ),
    );
  }
}
