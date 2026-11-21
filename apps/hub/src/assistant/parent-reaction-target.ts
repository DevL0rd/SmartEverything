import type { AiChatRow } from '@smarteverything/domain';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { Store } from '../store/store';
import { assertHelperDelivery } from './delegation/helper-delivery';
import { nativeHelperReactionInput } from './engines/dsh/helper-reaction-input';
import type { EngineRegistry } from './engines/registry';
import { admitChatExecution } from './native-helpers';
import { reactionForbidden } from './parent-reaction-read';
import { eventAuthority, executionRole, executionToolAdmitted } from './turn-authority';

interface ParentReactionPorts {
  readonly store: Store;
  readonly engines: EngineRegistry;
  readonly chat: AiChatRow;
}

export async function parentReactionTarget(
  { store, engines, chat }: ParentReactionPorts,
  authority: ConversationAuthority | undefined,
  childMessageId: string,
): Promise<{ readonly chatId: string; readonly messageId: string }> {
  if (authority === undefined || chat.kind !== 'subagent' || chat.parent_id === null)
    throw reactionForbidden();
  const { parent, event, messageId } = await store.host.read('assistantParentReaction', {
    chat,
    childMessageId,
  });
  const isCurrent =
    chat.engine.kind === 'dsh'
      ? await nativeHelperReactionInput(store, { chat, parent, event, authority })
      : event.id === authority.event_id;
  if (!isCurrent) throw reactionForbidden();
  await assertHelperDelivery(store, chat, event);
  await executionToolAdmitted(store, 'chat_edit', authority);
  const deliveryAuthority = await eventAuthority(store, event);
  await executionToolAdmitted(store, 'chat_edit', deliveryAuthority);
  admitChatExecution(parent);
  const role = executionRole(authority) === 'owner' ? executionRole(deliveryAuthority) : 'member';
  engines.forMutation(parent, role);
  return { chatId: parent.id, messageId };
}
