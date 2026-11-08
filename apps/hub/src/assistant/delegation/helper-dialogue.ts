import { randomUUID } from 'node:crypto';
import {
  ApiError,
  HELPER_DIALOGUE_KIND,
  HELPER_INPUT_KIND,
  helperDialogueOf,
  messageQuoteOf,
  type AiChatRow,
  type AssistantMessageRow,
  type AssistantNewMessage,
  type ClientRow,
} from '@smarteverything/domain';
import { effectiveClientById } from '../../server/person-access';
import type { StoredAttachment } from '../../store/repositories/assistant-chat';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import type { ConversationLog } from '../conversation-log';
import { helperAnswerQuote } from '../message-quote';
import type { AssistantFiles } from '../files';
import type { EngineRegistry } from '../engines/registry';
import { helperReplyWasRelayed } from '../engines/dsh/helper-reply';
import { HUB_RESTARTED } from '../interruption';
import { admitChatExecution } from '../native-helpers';
import { ownedUploads, queueEvent } from '../request-events';
import type { Sender } from '../requests';
import { admitExecutionTarget, eventAuthority, executionRole } from '../turn-authority';

import { payloadHash, receiptKey, receiptOf } from './helper-receipt';
export { assertOrdinaryMessageKey } from './helper-receipt';

interface DialoguePorts {
  readonly store: Store;
  readonly conversation: ConversationLog;
  readonly engines: EngineRegistry;
  readonly files: AssistantFiles;
  readonly added: () => void;
  readonly queueRun: (parent: AiChatRow, target: AiChatRow, eventId: string, text: string) => void;
}

interface DirectedMessage {
  readonly text: string;
  readonly uploadIds: readonly string[];
  readonly targetId: string;
  readonly quoteId: string | null;
  readonly clientMessageId: string;
}

export async function sendHelperDialogue(
  ports: DialoguePorts,
  sender: Sender,
  parent: AiChatRow,
  body: AssistantNewMessage,
): Promise<AssistantMessageRow> {
  const message = directedMessage(body);
  const { store, files } = ports;
  const source = activeParent(store, sender, parent.id);
  const sent = receiptOf(store, source.parent, message);
  if (sent !== undefined) return sent;
  const prepared = resolveDelivery(ports, sender, source, message);
  const copies: StoredAttachment[] = [];
  let accepted = false;
  try {
    if (prepared.originals.length > 0) {
      await preflight(ports, prepared);
      for (const file of prepared.originals) copies.push(await files.prepareCopy(file));
    }
    const row = store.write(() => {
      const currentSource = activeParent(store, sender, parent.id);
      const existing = receiptOf(store, currentSource.parent, message);
      if (existing !== undefined) return { row: existing, added: false };
      const current = resolveDelivery(ports, sender, currentSource, message);
      assertPrepared(prepared, current);
      const childFiles = ownedUploads(
        store,
        sender.profileId,
        copies.map((file) => file.id),
      );
      return { row: queueDialogue(ports, { ...current, childFiles }), added: true };
    });
    accepted = row.added;
    if (accepted) ports.added();
    return row.row;
  } finally {
    if (!accepted && copies.length > 0) await files.discardCopies(copies);
  }
}

interface ActiveParent {
  readonly parent: AiChatRow;
  readonly client: ClientRow;
}

function activeParent(store: Store, sender: Sender, parentId: string): ActiveParent {
  const client = initiatingClient(store, sender.clientId, sender.profileId);
  const parent = store.aiChats.chat(parentId);
  if (sender.profileId !== parent.profile_id)
    throw new ApiError('forbidden', 'Use the active conversation profile to address a helper.');
  return { parent, client };
}

function preflight(ports: DialoguePorts, delivery: Delivery): Promise<void> {
  const engine = ports.engines.engineOf(delivery.target);
  const prepare = engine?.preflightHelperInput;
  if (prepare === undefined && engine?.helperReady !== undefined) return Promise.resolve();
  if (prepare === undefined)
    throw new ApiError('conflict', 'This helper cannot accept attachments from the parent chat.');
  return prepare({
    target: delivery.target,
    clientId: delivery.sender.clientId,
    files: delivery.originals,
    text: delivery.message.text,
    quote: delivery.quoted?.text ?? null,
  });
}

function resolveDelivery(
  ports: DialoguePorts,
  sender: Sender,
  { parent, client }: ActiveParent,
  message: DirectedMessage,
): Delivery {
  const { store } = ports;
  const target = store.aiChats.find(message.targetId);
  if (target === undefined) throw new ApiError('not_found', 'That helper is no longer available.');
  assertTarget(store, parent, target);
  const quoted = helperAnswerQuote(store, parent, target, message.quoteId);
  assertHelperReady(ports.engines, target, client.role, message.uploadIds.length > 0);
  return {
    sender,
    parent,
    target,
    message,
    quoted,
    originals: ownedUploads(store, sender.profileId, message.uploadIds),
  };
}

function assertHelperReady(
  engines: EngineRegistry,
  target: AiChatRow,
  role: ClientRow['role'],
  attachments: boolean,
): void {
  const engine = engines.forMutation(target, role);
  if (target.engine.kind === 'dsh' && engine?.helperReady === undefined)
    throw new ApiError(
      'conflict',
      'This helper cannot receive a separate turn from the parent chat yet.',
    );
  const reason = engine?.helperReady?.(target, role, attachments);
  if (reason !== undefined && reason !== null) throw new ApiError('conflict', reason);
  const unavailable = engines.ready(target);
  if (unavailable !== null) throw new ApiError('conflict', unavailable);
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

function directedMessage(body: AssistantNewMessage): DirectedMessage {
  if (body.helper_target === undefined || body.client_message_id === undefined)
    throw new ApiError('invalid_request', 'Choose a helper and provide a client message ID.');
  if (body.text === '' && body.attachments.length === 0)
    throw new ApiError('invalid_request', 'Send some text or at least one attachment.');
  if ((body.references?.length ?? 0) > 0)
    throw new ApiError(
      'invalid_request',
      'This helper message does not support structured references.',
    );
  return {
    text: body.text,
    uploadIds: body.attachments,
    targetId: body.helper_target.chat_id,
    quoteId: body.quote_message_id ?? null,
    clientMessageId: body.client_message_id,
  };
}

function assertTarget(store: Store, parent: AiChatRow, target: AiChatRow): void {
  if (
    target.kind !== 'subagent' ||
    target.parent_id !== parent.id ||
    target.profile_id !== parent.profile_id
  )
    throw new ApiError('forbidden', 'Choose a direct helper of this conversation.');
  store.aiChats.assertWorkAllowed(parent.id);
  store.aiChats.assertWorkAllowed(target.id);
  admitChatExecution(target);
  if (target.archived_at !== null)
    throw new ApiError('conflict', 'This helper is archived. Reopen it before sending a message.');
}

interface Delivery {
  readonly sender: Sender;
  readonly parent: AiChatRow;
  readonly target: AiChatRow;
  readonly message: DirectedMessage;
  readonly quoted: AssistantMessageRow | null;
  readonly originals: readonly StoredAttachment[];
}

function queueDialogue(
  ports: DialoguePorts,
  delivery: Delivery & { readonly childFiles: readonly StoredAttachment[] },
): AssistantMessageRow {
  const { store, conversation } = ports;
  const { sender, parent, target, message } = delivery;
  const helperName = target.helper_name;
  if (helperName === null) throw new Error('An addressable helper has no stored name.');
  const input = {
    author: store.profiles.byId(sender.profileId).name,
    clientId: sender.clientId,
    text: message.text,
    origin: { source: 'app', plugin_id: null, device_id: null, name: null } as const,
  };
  const parentRow = conversation.person({
    ...input,
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
  const childRow = conversation.person({
    ...input,
    chat: target,
    files: delivery.childFiles,
    origin: { ...input.origin, name: parent.title, chat_id: parent.id },
    helperInput: true,
  });
  queueChildInput(ports, delivery, parentRow.id, childRow.id);
  store.aiChats.update(parent.id, { read: true });
  return parentRow;
}

function queueChildInput(
  ports: DialoguePorts,
  { sender, parent, target, message, quoted }: Delivery,
  parentId: string,
  childId: string,
): void {
  const { store } = ports;
  const event = queueEvent(store, {
    id: randomUUID(),
    kind: 'chat',
    chat_id: target.id,
    message_id: childId,
    profile_id: sender.profileId,
    client_id: sender.clientId,
    text: message.text,
    helper_parent_message_id: parentId,
    helper_quote_text: quoted?.text ?? null,
  });
  const authority = eventAuthority(store, event);
  admitExecutionTarget(store, target, authority);
  ports.engines.forMutation(target, executionRole(authority));
  ports.queueRun(parent, target, event.id, message.text);
}

export function helperParentMessageId(event: StoredEvent): string | null {
  return event.helper_parent_message_id ?? null;
}

function initiatingClient(store: Store, clientId: string, profileId: string): ClientRow {
  const client = effectiveClientById(store, clientId);
  if (store.profiles.activeOf(client.id).id !== profileId)
    throw new ApiError('forbidden', 'The sending app no longer has the initiating profile active.');
  return client;
}

export function assertHelperDelivery(
  store: Store,
  target: AiChatRow,
  event: StoredEvent,
): readonly string[] {
  const id = helperParentMessageId(event);
  if (id === null) return [];
  const row = directedParentRow(store, id, target.id);
  if (row.profile_id !== event.profile_id || event.message_id === null || event.client_id === null)
    throw new ApiError('conflict', 'The admitted helper input is unavailable.');
  const attachments = childAttachmentIds(store, event.message_id, target.id, event.profile_id);
  const client = initiatingClient(store, event.client_id, event.profile_id);
  if (eventAuthority(store, event).role === 'owner' && client.role !== 'owner')
    throw new ApiError('forbidden', 'The sending app no longer has the initiating access.');
  assertTarget(store, store.aiChats.chat(row.chat_id), target);
  return attachments;
}

function directedParentRow(store: Store, id: string, targetId: string): AssistantMessageRow {
  const row = store.assistantChat.find(id);
  const dialogue = row === undefined ? undefined : helperDialogueOf(row);
  if (
    row === undefined ||
    dialogue?.direction !== 'to_helper' ||
    dialogue.helper_chat_id !== targetId
  )
    throw new ApiError('conflict', 'The message that addressed this helper was removed.');
  return row;
}

function childAttachmentIds(
  store: Store,
  messageId: string,
  targetId: string,
  profileId: string,
): readonly string[] {
  const child = store.assistantChat.find(messageId);
  if (
    child?.chat_id !== targetId ||
    child.role !== 'person' ||
    child.profile_id !== profileId ||
    !child.embeds.some(({ kind }) => kind === HELPER_INPUT_KIND)
  )
    throw new ApiError('conflict', 'The admitted helper input is unavailable.');
  const bound = store.assistantChat.attachmentsOf(child.id);
  if (
    child.attachments.length !== bound.length ||
    child.attachments.some(
      (file) => !bound.some((stored) => stored.id === file.id && stored.profile_id === profileId),
    )
  )
    throw new ApiError('conflict', 'An attachment from the admitted helper input was removed.');
  return child.attachments.map(({ id }) => id);
}

export function reconcileHelperDialogue(
  store: Store,
  finish: (event: StoredEvent, text: string, ok: boolean) => void,
): void {
  const { assistantChat, assistantEvents } = store;
  for (const event of assistantEvents.settledHelperEvents()) {
    if (store.harnessDeliveries.find(event.id)?.state === 'admitted') continue;
    const message = event.message_id === null ? undefined : assistantChat.find(event.message_id);
    store.write(() => {
      assistantEvents.mark(event.id, 'answered_at');
      const reply = restoreAnsweredHelperMessage(assistantChat, message);
      if (reply !== undefined || message?.state === 'answered')
        finish(event, reply?.text ?? '', true);
      else finish(event, message?.reason ?? HUB_RESTARTED, false);
    });
  }
}

function restoreAnsweredHelperMessage(
  assistantChat: Store['assistantChat'],
  message: AssistantMessageRow | undefined,
): AssistantMessageRow | undefined {
  if (message === undefined) return undefined;
  const reply = assistantChat.repliesTo(message.id).findLast((row) => row.state === 'answered');
  if (reply !== undefined && message.state !== 'answered')
    assistantChat.updateMessage(message.id, {
      state: 'answered',
      reason: null,
      reason_code: null,
    });
  return reply;
}

export function settleHelperDialogue(
  ports: Pick<DialoguePorts, 'store' | 'conversation'>,
  event: StoredEvent,
  text: string,
  ok: boolean,
): boolean {
  const id = helperParentMessageId(event);
  if (id === null) return false;
  const { store, conversation } = ports;
  store.write(() => {
    const row = store.assistantChat.find(id);
    const dialogue = row === undefined ? undefined : helperDialogueOf(row);
    if (row === undefined || dialogue?.direction !== 'to_helper' || row.state !== null) return;
    if (!ok) {
      conversation.failedMessage(row.id, text, 'unknown');
      return;
    }
    if (text.trim() !== '' && !helperReplyWasRelayed(store, event, row.chat_id)) {
      conversation.responderInChat({
        chat: store.aiChats.chat(row.chat_id),
        replyTo: null,
        text,
        messageId: event.id,
        helperDialogue: { ...dialogue, direction: 'from_helper' },
        quote: messageQuoteOf(row),
      });
    }
    conversation.stateOf(row.id, 'answered');
  });
  return true;
}
