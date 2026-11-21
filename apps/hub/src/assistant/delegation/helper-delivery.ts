import {
  ApiError,
  HELPER_INPUT_KIND,
  helperDialogueOf,
  type AiChatRow,
  type AssistantMessageRow,
  type ClientRow,
} from '@smarteverything/domain';
import { effectiveClientById } from '../../server/person-access-units';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import { assertHeldWork, type HeldChats } from '../../store/repositories/ai-chat-removal-hold';
import type { Store } from '../../store/store';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import { admitChatExecution } from '../native-helpers';
import { authorityScope, type AuthorityScope } from '../turn-authority';
import { issueEventAuthority } from '../event-authority-issue';

export function helperParentMessageId(event: StoredEvent): string | null {
  return event.helper_parent_message_id ?? null;
}

export function assertHelperTarget(
  parent: AiChatRow,
  target: AiChatRow,
  workAllowed: (chatId: string) => void,
): void {
  if (
    target.kind !== 'subagent' ||
    target.parent_id !== parent.id ||
    target.profile_id !== parent.profile_id
  )
    throw new ApiError('forbidden', 'Choose a direct helper of this conversation.');
  workAllowed(parent.id);
  workAllowed(target.id);
  admitChatExecution(target);
  if (target.archived_at !== null)
    throw new ApiError('conflict', 'This helper is archived. Reopen it before sending a message.');
}

function initiatingClient(store: HostStore, clientId: string, profileId: string): ClientRow {
  const client = effectiveClientById(store, clientId);
  if (store.profiles.activeOf(client.id).id !== profileId)
    throw new ApiError('forbidden', 'The sending app no longer has the initiating profile active.');
  return client;
}

function directedParentRow(store: HostStore, id: string, targetId: string): AssistantMessageRow {
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
  store: HostStore,
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

export interface HelperDeliveryCheck {
  readonly target: AiChatRow;
  readonly event: StoredEvent;
  readonly held: HeldChats;
  readonly scope: AuthorityScope;
}

export function checkedHelperDelivery(
  store: HostStore,
  input: HelperDeliveryCheck,
): readonly string[] {
  const { target, event } = input;
  const id = helperParentMessageId(event);
  if (id === null) return [];
  const row = directedParentRow(store, id, target.id);
  if (row.profile_id !== event.profile_id || event.message_id === null || event.client_id === null)
    throw new ApiError('conflict', 'The admitted helper input is unavailable.');
  const attachments = childAttachmentIds(store, event.message_id, target.id, event.profile_id);
  const client = initiatingClient(store, event.client_id, event.profile_id);
  if (issueEventAuthority(store, event, input.scope).role === 'owner' && client.role !== 'owner')
    throw new ApiError('forbidden', 'The sending app no longer has the initiating access.');
  assertHelperTarget(store.aiChats.chat(row.chat_id), target, (chatId) => {
    store.aiChats.assertWorkAllowed(chatId);
    assertHeldWork(input.held, chatId);
  });
  return attachments;
}

export const HELPER_DELIVERY_UNIT = storeUnit(checkedHelperDelivery);

export function assertHelperDelivery(
  store: Store,
  chat: AiChatRow,
  event: StoredEvent,
): Promise<readonly string[]> {
  return store.host.write('assistantHelperDelivery', {
    target: chat,
    event,
    held: store.live.chatWork.holds.held(),
    scope: authorityScope(),
  });
}
