import { randomUUID } from 'node:crypto';
import { Logger } from '@smarteverything/logging';
import {
  ApiError,
  type AiChatRow,
  type AiEdit,
  type AiRetryFrom,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import {
  summaryOf,
  type AssistantMessageChange,
  type StoredAttachment,
} from '../store/repositories/assistant-chat';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import { CONTINUE_NOTE } from './interruption';
import type { AssistantDelivery } from './delivery';
import type { AssistantFiles } from './files';
import { ownedUploads, queueEvent } from './request-events';
import { eventAuthority } from './turn-authority';

const log = new Logger('hub.assistant-replay');

export interface ReplayDeps {
  readonly store: Store;
  readonly files: AssistantFiles;
  readonly delivery: () => AssistantDelivery;
}

interface FileReplacement {
  readonly kept: StoredAttachment[];
  readonly removed: StoredAttachment[];
}

const KEPT_FILES: FileReplacement = { kept: [], removed: [] };

interface Rearmed {
  readonly row: AssistantMessageRow;
  readonly files: readonly StoredAttachment[];
  readonly queued: boolean;
}

export class MessageReplay {
  constructor(private readonly deps: ReplayDeps) {}

  async retry(
    chat: AiChatRow,
    messageId: string,
    from: AiRetryFrom,
    clientId?: string | null,
  ): Promise<AssistantMessageRow> {
    return this.replayed('retry', chat.id, messageId, () =>
      this.continued(chat, messageId, from, clientId),
    );
  }

  async edit(
    chat: AiChatRow,
    messageId: string,
    body: AiEdit,
    clientId?: string | null,
  ): Promise<AssistantMessageRow> {
    return this.replayed('edit', chat.id, messageId, () =>
      this.reword(chat, messageId, body, clientId),
    );
  }

  private async replayed(
    kind: 'retry' | 'edit',
    chatId: string,
    messageId: string,
    work: () => Rearmed,
  ): Promise<AssistantMessageRow> {
    const { row, files, queued } = this.deps.store.write(work);
    log.info('replay.settled', {
      kind,
      chatId,
      messageId,
      queued,
      state: row.state,
      removedFiles: files.length,
    });
    await this.deps.files.remove(files);
    if (queued) {
      this.deps.delivery().added();
    }
    return row;
  }

  private continued(
    chat: AiChatRow,
    messageId: string,
    from: AiRetryFrom,
    clientId: string | null | undefined,
  ): Rearmed {
    const { message, event } = this.askedMessage(chat, messageId);
    if (message.state !== from) {
      return { row: message, files: [], queued: false };
    }
    this.requireLatest(chat, message, 'continued');
    const row = this.deps.store.assistantChat.updateMessage(message.id, {
      state: 'answered',
      reason: null,
      reason_code: null,
    });
    queueEvent(
      this.deps.store,
      {
        id: randomUUID(),
        kind: event.kind,
        chat_id: chat.id,
        message_id: null,
        profile_id: event.profile_id,
        client_id: clientId === undefined ? event.client_id : clientId,
        text: CONTINUE_NOTE,
        report_to: event.report_to,
        hops: event.hops,
      },
      eventAuthority(this.deps.store, event),
    );
    return { row, files: [], queued: true };
  }

  private reword(
    chat: AiChatRow,
    messageId: string,
    body: AiEdit,
    clientId: string | null | undefined,
  ): Rearmed {
    const { message, event } = this.askedMessage(chat, messageId);
    if (message.origin !== null && message.origin.source !== 'app') {
      throw new ApiError('invalid_request', 'Only a message written in the app can be edited.');
    }
    if (message.state !== 'answered' && message.state !== 'failed') {
      throw new ApiError('conflict', 'Wait for the AI to finish, or stop it, before editing.');
    }
    this.requireLatest(chat, message, 'edited');
    const replaced =
      body.attachments === undefined ? KEPT_FILES : this.replaceFiles(message, body.attachments);
    const change: AssistantMessageChange = {
      text: body.text,
      references: body.references ?? [],
      ...(body.attachments === undefined ? {} : { attachments: replaced.kept.map(summaryOf) }),
    };
    const done = this.replay(chat, { message, event }, change, clientId);
    return { ...done, files: [...done.files, ...replaced.removed] };
  }

  private replaceFiles(message: AssistantMessageRow, ids: readonly string[]): FileReplacement {
    const { assistantChat } = this.deps.store;
    const kept = ownedUploads(this.deps.store, message.profile_id, ids);
    const removed = assistantChat.attachmentsOf(message.id);
    assistantChat.removeAttachments(removed.map((file) => file.id));
    assistantChat.attachTo(
      message.id,
      kept.map((file) => file.id),
    );
    return { kept, removed };
  }

  private askedMessage(
    chat: AiChatRow,
    messageId: string,
  ): { readonly message: AssistantMessageRow; readonly event: StoredEvent } {
    const { assistantChat: messages, assistantEvents: events } = this.deps.store;
    const message = messages.message(messageId);
    const event = events.ofMessage(messageId);
    if (message.chat_id !== chat.id || message.role !== 'person' || event === undefined) {
      throw new ApiError(
        'invalid_request',
        'Only a message of a person that the AI was asked about can be retried or edited.',
      );
    }
    return { message, event };
  }

  assertReplay(chat: AiChatRow, messageId: string, edit?: AiEdit): void {
    const { message } = this.askedMessage(chat, messageId);
    this.requireLatest(chat, message, 'changed');
    if (edit !== undefined && message.origin !== null && message.origin.source !== 'app')
      throw new ApiError('invalid_request', 'Only an app message can be edited.');
    if (edit?.attachments !== undefined)
      ownedUploads(this.deps.store, message.profile_id, edit.attachments);
  }

  private requireLatest(chat: AiChatRow, message: AssistantMessageRow, verb: string): void {
    if (this.deps.store.assistantChat.latestPersonText(chat.id)?.id !== message.id) {
      throw new ApiError('conflict', `Only the latest message of a chat can be ${verb}.`);
    }
  }

  private replay(
    chat: AiChatRow,
    asked: { readonly message: AssistantMessageRow; readonly event: StoredEvent },
    change: AssistantMessageChange,
    clientId: string | null | undefined,
  ): Rearmed {
    const { message, event } = asked;
    const original = eventAuthority(this.deps.store, event);
    const { assistantChat: messages } = this.deps.store;
    const files = messages.removeMessages(messages.repliesTo(message.id).map((reply) => reply.id));
    const row = messages.updateMessage(message.id, {
      ...change,
      state: 'queued',
      reason: null,
      reason_code: null,
    });
    queueEvent(
      this.deps.store,
      {
        id: randomUUID(),
        kind: event.kind,
        chat_id: chat.id,
        message_id: message.id,
        profile_id: event.profile_id,
        client_id: clientId === undefined ? event.client_id : clientId,
        text: change.text ?? event.text,
        report_to: event.report_to,
        hops: event.hops,
      },
      original,
    );

    return { row, files, queued: true };
  }
}
