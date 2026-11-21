import {
  ApiError,
  type AiChatRow,
  type AiNativeCommandReceipt,
  type AiNativeCommandWrite,
} from '@smarteverything/domain';
import { durableStoreUnit } from '../../../store/host/unit';
import { assertHeldQueued, type HeldChats } from '../../../store/repositories/ai-chat-removal-hold';
import type { HostStore } from '../../../store/host/host-store';
import { personMessage } from '../../conversation-log';
import { applyReplyOp } from '../../reply-records';
import { addConversationMessage } from '../../store-units';
import { admitExecutionOn, executionRole, type AuthorityScope } from '../../turn-authority';
import { issueEventAuthority } from '../../event-authority-issue';

export interface ManualCommandRetention {
  readonly chat: AiChatRow;
  readonly client: { readonly id: string; readonly name: string };
  readonly text: string;
  readonly input: AiNativeCommandWrite;
  readonly receipt: AiNativeCommandReceipt;
  readonly held: HeldChats;
  readonly scope: AuthorityScope;
  readonly localDevice: string | null;
}

function retain(store: HostStore, retention: ManualCommandRetention): void {
  const { chat, client, input } = retention;
  if (client.id !== input.scope.client_id)
    throw new ApiError('forbidden', 'The native command has another initiating manual event.');
  const message = addConversationMessage(store, {
    row: personMessage({
      chat,
      clientId: client.id,
      author: client.name,
      text: retention.text,
      files: [],
      clientMessageId: input.operation_id,
      origin: { source: 'chat', plugin_id: null, device_id: input.scope.device_id, name: null },
    }),
    files: [],
  });
  assertHeldQueued(retention.held, chat.id);
  const event = store.assistantEvents.add({
    id: input.operation_id,
    kind: 'chat',
    chat_id: chat.id,
    message_id: message.id,
    profile_id: chat.profile_id,
    client_id: client.id,
    text: retention.text,
  });
  store.assistantEvents.mark(event.id, 'delivered_at');
  const authority = issueEventAuthority(store, event, retention.scope);
  if (authority.client_id !== input.scope.client_id || executionRole(authority) !== 'owner')
    throw new ApiError(
      'forbidden',
      'The command initiating authority no longer permits owner execution.',
    );
  admitExecutionOn(chat, authority, (id) => id === retention.localDevice);
  store.nativeCommandOperations.reserve(input, retention.receipt);
  applyReplyOp(store, { kind: 'state', messageId: message.id, state: 'working', reason: null });
}

export const MANUAL_COMMAND_RETAIN_UNIT = durableStoreUnit(retain);
