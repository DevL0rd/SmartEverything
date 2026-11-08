import { ApiError, helperDialogueOf, type AiChatRow } from '@smarteverything/domain';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import { assertHelperDelivery, helperParentMessageId } from './delegation/helper-dialogue';
import { nativeHelperReactionInput } from './engines/dsh/helper-reaction-input';
import type { EngineRegistry } from './engines/registry';
import { admitChatExecution } from './native-helpers';
import { admitExecutionTool, eventAuthority, executionRole } from './turn-authority';

interface ParentReactionPorts {
  readonly store: Store;
  readonly engines: EngineRegistry;
  readonly chat: AiChatRow;
}

function forbidden(): ApiError {
  return new ApiError(
    'forbidden',
    'Choose an input currently delivered to you from your parent conversation.',
  );
}

function deliveredInput(store: Store, chat: AiChatRow, messageId: string): StoredEvent {
  const event = store.assistantEvents.ofMessage(messageId);
  if (
    event?.chat_id !== chat.id ||
    event.profile_id !== chat.profile_id ||
    event.kind !== 'chat' ||
    event.delivered_at === null ||
    event.answered_at !== null
  )
    throw forbidden();
  return event;
}

function parentProjection(
  store: Store,
  link: {
    readonly parent: AiChatRow;
    readonly child: AiChatRow;
    readonly event: StoredEvent;
  },
): string {
  const id = helperParentMessageId(link.event);
  if (id === null) throw forbidden();
  const message = store.assistantChat.find(id);
  if (
    message?.chat_id !== link.parent.id ||
    message.profile_id !== link.parent.profile_id ||
    helperDialogueOf(message)?.helper_chat_id !== link.child.id
  )
    throw forbidden();
  return id;
}

export function parentReactionTarget(
  { store, engines, chat }: ParentReactionPorts,
  authority: ConversationAuthority | undefined,
  childMessageId: string,
): { readonly chatId: string; readonly messageId: string } {
  if (authority === undefined || chat.kind !== 'subagent' || chat.parent_id === null)
    throw forbidden();
  const parent = store.aiChats.find(chat.parent_id);
  if (parent?.profile_id !== chat.profile_id) throw forbidden();
  const event = deliveredInput(store, chat, childMessageId);
  const isCurrent =
    chat.engine.kind === 'dsh'
      ? nativeHelperReactionInput(store, { chat, parent, event, authority })
      : event.id === authority.event_id;
  if (!isCurrent) throw forbidden();
  const messageId = parentProjection(store, { parent, child: chat, event });
  assertHelperDelivery(store, chat, event);
  admitExecutionTool(store, 'chat_edit', authority);
  const deliveryAuthority = eventAuthority(store, event);
  admitExecutionTool(store, 'chat_edit', deliveryAuthority);
  admitChatExecution(parent);
  const role = executionRole(authority) === 'owner' ? executionRole(deliveryAuthority) : 'member';
  engines.forMutation(parent, role);
  return { chatId: parent.id, messageId };
}
