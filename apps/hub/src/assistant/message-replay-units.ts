import { randomUUID } from 'node:crypto';
import {
  ApiError,
  isHelperDialogueMessage,
  type AiChatRow,
  type AiEdit,
  type AiRetryFrom,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import type { ConversationAuthority } from '../harness/authority-contract';
import {
  summaryOf,
  type AssistantMessageChange,
  type StoredAttachment,
} from '../store/repositories/assistant-chat';
import { assertHeldQueued, type HeldChats } from '../store/repositories/ai-chat-removal-hold';
import type { NewEvent, StoredEvent } from '../store/repositories/assistant-events';
import type { HostStore } from '../store/host/host-store';
import { storeUnit } from '../store/host/unit';
import { CONTINUE_NOTE, HUB_AUTHOR, HUB_ORIGIN } from './interruption';
import { noteMessage } from './note-message';
import { ownedUploadsOf } from './owned-uploads';
import { addConversationMessage, queueEventNow } from './store-units';
import { type AuthorityScope } from './turn-authority';
import { issueEventAuthority } from './event-authority-issue';

interface FileReplacement {
  readonly kept: StoredAttachment[];
  readonly removed: StoredAttachment[];
}

const KEPT_FILES: FileReplacement = { kept: [], removed: [] };

export interface Rearmed {
  readonly row: AssistantMessageRow;
  readonly files: readonly StoredAttachment[];
  readonly event: StoredEvent | null;
}

interface ReplayContext {
  readonly chat: AiChatRow;
  readonly messageId: string;
  readonly clientId: string | null | undefined;
  readonly held: HeldChats;
  readonly scope: AuthorityScope;
}

export interface RetryInput extends ReplayContext {
  readonly from: AiRetryFrom;
}

export interface EditInput extends ReplayContext {
  readonly body: AiEdit;
}

export interface ReplayCheck {
  readonly chat: AiChatRow;
  readonly messageId: string;
  readonly edit: AiEdit | undefined;
}

function sourced(scope: AuthorityScope, source: ConversationAuthority): AuthorityScope {
  return {
    ...scope,
    sources: [
      ...new Map(
        [source, ...scope.sources].map((parent) => [parent.event_id, parent] as const),
      ).values(),
    ],
  };
}

function queued(
  store: HostStore,
  context: ReplayContext,
  event: NewEvent,
  source: ConversationAuthority,
): StoredEvent {
  assertHeldQueued(context.held, event.chat_id);
  return queueEventNow(store, { event, scope: sourced(context.scope, source) });
}

function askedMessage(
  store: HostStore,
  chat: AiChatRow,
  messageId: string,
): { readonly message: AssistantMessageRow; readonly event: StoredEvent } {
  const message = store.assistantChat.message(messageId);
  if (message.chat_id === chat.id && isHelperDialogueMessage(message))
    throw new ApiError(
      'conflict',
      'Send a new message from the parent chat to follow up with this helper.',
    );
  const event = store.assistantEvents.ofMessage(messageId);
  if (message.chat_id !== chat.id || message.role !== 'person' || event === undefined) {
    throw new ApiError(
      'invalid_request',
      'Only a message of a person that the AI was asked about can be retried or edited.',
    );
  }
  return { message, event };
}

function requireLatest(
  store: HostStore,
  chat: AiChatRow,
  message: AssistantMessageRow,
  verb: string,
): void {
  if (store.assistantChat.latestPersonText(chat.id)?.id !== message.id) {
    throw new ApiError('conflict', `Only the latest message of a chat can be ${verb}.`);
  }
}

function continued(store: HostStore, input: RetryInput): Rearmed {
  const { chat, clientId } = input;
  const { message, event } = askedMessage(store, chat, input.messageId);
  if (message.state !== input.from) return { row: message, files: [], event: null };
  requireLatest(store, chat, message, 'continued');
  const row = store.assistantChat.updateMessage(message.id, {
    state: 'answered',
    reason: null,
    reason_code: null,
  });
  const note = addConversationMessage(store, {
    row: noteMessage(chat, HUB_AUTHOR, CONTINUE_NOTE, HUB_ORIGIN),
    files: [],
  });
  const queuedEvent = queued(
    store,
    input,
    {
      id: randomUUID(),
      kind: event.kind,
      chat_id: chat.id,
      message_id: note.id,
      profile_id: event.profile_id,
      client_id: clientId === undefined ? event.client_id : clientId,
      text: CONTINUE_NOTE,
      report_to: event.report_to,
      hops: event.hops,
    },
    issueEventAuthority(store, event, input.scope),
  );
  return { row, files: [], event: queuedEvent };
}

function replaceFiles(
  store: HostStore,
  message: AssistantMessageRow,
  ids: readonly string[],
): FileReplacement {
  const { assistantChat } = store;
  const kept = ownedUploadsOf(store, message.profile_id, ids);
  const removed = assistantChat.attachmentsOf(message.id);
  assistantChat.removeAttachments(removed.map((file) => file.id));
  assistantChat.attachTo(
    message.id,
    kept.map((file) => file.id),
  );
  return { kept, removed };
}

function reword(store: HostStore, input: EditInput): Rearmed {
  const { chat, body, clientId } = input;
  const { message, event } = askedMessage(store, chat, input.messageId);
  if (message.origin !== null && message.origin.source !== 'app') {
    throw new ApiError('invalid_request', 'Only a message written in the app can be edited.');
  }
  if (message.state !== 'answered' && message.state !== 'failed') {
    throw new ApiError('conflict', 'Wait for the AI to finish, or stop it, before editing.');
  }
  requireLatest(store, chat, message, 'edited');
  const replaced =
    body.attachments === undefined ? KEPT_FILES : replaceFiles(store, message, body.attachments);
  const change: AssistantMessageChange = {
    text: body.text,
    references: body.references ?? [],
    ...(body.attachments === undefined ? {} : { attachments: replaced.kept.map(summaryOf) }),
  };
  const original = issueEventAuthority(store, event, input.scope);
  const messages = store.assistantChat;
  const files = messages.removeMessages(messages.repliesTo(message.id).map((reply) => reply.id));
  const row = messages.updateMessage(message.id, {
    ...change,
    state: 'queued',
    reason: null,
    reason_code: null,
  });
  const queuedEvent = queued(
    store,
    input,
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
  return { row, files: [...files, ...replaced.removed], event: queuedEvent };
}

function checkedReplay(store: HostStore, input: ReplayCheck): void {
  const { chat, edit } = input;
  const { message } = askedMessage(store, chat, input.messageId);
  requireLatest(store, chat, message, 'changed');
  if (edit !== undefined && message.origin !== null && message.origin.source !== 'app')
    throw new ApiError('invalid_request', 'Only an app message can be edited.');
  if (edit?.attachments !== undefined) ownedUploadsOf(store, message.profile_id, edit.attachments);
}

export const REPLAY_RETRY_UNIT = storeUnit((store, input: RetryInput) =>
  store.write(() => continued(store, input)),
);
export const REPLAY_EDIT_UNIT = storeUnit((store, input: EditInput) =>
  store.write(() => reword(store, input)),
);
export const REPLAY_CHECK_UNIT = storeUnit(checkedReplay);
