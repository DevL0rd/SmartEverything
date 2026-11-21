import { randomUUID } from 'node:crypto';
import {
  ApiError,
  HELPER_DIALOGUE_KIND,
  messageQuoteOf,
  type AiChatRow,
  type AssistantMessageRow,
  type ClientRow,
} from '@smarteverything/domain';
import { effectiveClientById } from '../../server/person-access-units';
import type { StoredAttachment } from '../../store/repositories/assistant-chat';
import {
  assertHeldQueued,
  assertHeldWork,
  type HeldChats,
} from '../../store/repositories/ai-chat-removal-hold';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import { addPersonMessage } from '../store-units';
import { queuedRun } from '../agent-runs/run-units';
import { ownedUploadsOf } from '../owned-uploads';
import { admitExecutionOn, executionRole, type AuthorityScope } from '../turn-authority';
import { issueEventAuthority } from '../event-authority-issue';
import { helperAnswerQuote } from '../message-quote';
import { assertHelperTarget } from './helper-delivery';
import { payloadHash, receiptKey, receiptOf } from './helper-receipt';

export interface DialogueSender {
  readonly clientId: string;
  readonly profileId: string;
}

export interface DirectedMessage {
  readonly text: string;
  readonly uploadIds: readonly string[];
  readonly targetId: string;
  readonly quoteId: string | null;
  readonly clientMessageId: string;
}

export interface Delivery {
  readonly sender: DialogueSender;
  readonly parent: AiChatRow;
  readonly client: ClientRow;
  readonly target: AiChatRow;
  readonly message: DirectedMessage;
  readonly quoted: AssistantMessageRow | null;
  readonly originals: readonly StoredAttachment[];
}

export interface DialogueRequest {
  readonly sender: DialogueSender;
  readonly parentId: string;
  readonly message: DirectedMessage;
  readonly held: HeldChats;
}

export type DialoguePrepared =
  | { readonly kind: 'sent'; readonly row: AssistantMessageRow }
  | { readonly kind: 'delivery'; readonly delivery: Delivery };

function initiatingClient(store: HostStore, clientId: string, profileId: string): ClientRow {
  const client = effectiveClientById(store, clientId);
  if (store.profiles.activeOf(client.id).id !== profileId)
    throw new ApiError('forbidden', 'The sending app no longer has the initiating profile active.');
  return client;
}

function prepared(store: HostStore, input: DialogueRequest): DialoguePrepared {
  const { sender, message, held } = input;
  const client = initiatingClient(store, sender.clientId, sender.profileId);
  const parent = store.aiChats.chat(input.parentId);
  if (sender.profileId !== parent.profile_id)
    throw new ApiError('forbidden', 'Use the active conversation profile to address a helper.');
  const sent = receiptOf(store, parent, message);
  if (sent !== undefined) return { kind: 'sent', row: sent };
  const target = store.aiChats.find(message.targetId);
  if (target === undefined) throw new ApiError('not_found', 'That helper is no longer available.');
  assertHelperTarget(parent, target, (chatId) => {
    store.aiChats.assertWorkAllowed(chatId);
    assertHeldWork(held, chatId);
  });
  return {
    kind: 'delivery',
    delivery: {
      sender,
      parent,
      client,
      target,
      message,
      quoted: helperAnswerQuote(store, parent, target, message.quoteId),
      originals: ownedUploadsOf(store, sender.profileId, message.uploadIds),
    },
  };
}

function assertPrepared(before: Delivery, current: Delivery): void {
  if (
    JSON.stringify(before.target.engine) !== JSON.stringify(current.target.engine) ||
    before.quoted?.text !== current.quoted?.text ||
    before.originals.some((file, index) => current.originals[index]?.sha256 !== file.sha256)
  )
    throw new ApiError(
      'conflict',
      'The helper or message changed while preparing attachments. Try again.',
    );
}

export interface DialogueQueue extends DialogueRequest {
  readonly prepared: Delivery;
  readonly copies: readonly string[];
  readonly scope: AuthorityScope;
  readonly localTarget: boolean;
  readonly ownerOnly: boolean;
  readonly now: string;
}

export type DialogueQueued =
  | { readonly added: false; readonly row: AssistantMessageRow }
  | { readonly added: true; readonly row: AssistantMessageRow; readonly eventId: string };

function dialogueRows(
  store: HostStore,
  delivery: Delivery,
  childFiles: readonly StoredAttachment[],
): { readonly parentRow: AssistantMessageRow; readonly childRow: AssistantMessageRow } {
  const { sender, parent, target, message } = delivery;
  const helperName = target.helper_name;
  if (helperName === null) throw new Error('An addressable helper has no stored name.');
  const base = {
    author: store.profiles.byId(sender.profileId).name,
    clientId: sender.clientId,
    text: message.text,
    origin: { source: 'app', plugin_id: null, device_id: null, name: null } as const,
  };
  const parentRow = addPersonMessage(store, {
    ...base,
    chat: parent,
    files: delivery.originals,
    clientMessageId: message.clientMessageId,
    helperDialogue: {
      kind: HELPER_DIALOGUE_KIND,
      direction: 'to_helper',
      helper_chat_id: target.id,
      helper_name: helperName,
    },
    quote: delivery.quoted === null ? null : messageQuoteOf(delivery.quoted),
  });
  store.assistantSearch.rememberHelper(receiptKey(parent, message.clientMessageId), {
    parent_message_id: parentRow.id,
    payload_hash: payloadHash(message),
  });
  const childRow = addPersonMessage(store, {
    ...base,
    chat: target,
    files: childFiles,
    origin: { ...base.origin, name: parent.title, chat_id: parent.id },
    helperInput: true,
  });
  return { parentRow, childRow };
}

function queuedInput(
  store: HostStore,
  input: DialogueQueue,
  delivery: Delivery,
  rows: { readonly parentRow: AssistantMessageRow; readonly childRow: AssistantMessageRow },
): string {
  const { sender, parent, target, message } = delivery;
  assertHeldQueued(input.held, target.id);
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: target.id,
    message_id: rows.childRow.id,
    profile_id: sender.profileId,
    client_id: sender.clientId,
    text: message.text,
    helper_parent_message_id: rows.parentRow.id,
    helper_quote_text: delivery.quoted?.text ?? null,
  });
  const authority = issueEventAuthority(store, event, input.scope);
  admitExecutionOn(target, authority, () => input.localTarget);
  if (input.ownerOnly && executionRole(authority) !== 'owner')
    throw new ApiError('forbidden', 'Only the home owner can use Claude or Codex on computers.');
  queuedRun(store, {
    parent,
    child: target,
    eventId: event.id,
    task: message.text,
    now: input.now,
  });
  return event.id;
}

function queued(store: HostStore, input: DialogueQueue): DialogueQueued {
  return store.write(() => {
    const current = prepared(store, input);
    if (current.kind === 'sent') return { added: false, row: current.row };
    const delivery = current.delivery;
    assertPrepared(input.prepared, delivery);
    const rows = dialogueRows(
      store,
      delivery,
      ownedUploadsOf(store, input.sender.profileId, input.copies),
    );
    const eventId = queuedInput(store, input, delivery, rows);
    store.aiChats.update(delivery.parent.id, { read: true });
    return { added: true, row: rows.parentRow, eventId };
  });
}

export const HELPER_DIALOGUE_PREPARE_UNIT = storeUnit(prepared);
export const HELPER_DIALOGUE_QUEUE_UNIT = storeUnit(queued);
