import type { AiChatRow } from '@smarteverything/domain';
import type { ChatDirectory, ChatOwner } from './chat-directory';
import type { EngineRegistry } from './engines/registry';
import type { AssistantDelivery } from './delivery';

export type RemovalAdmission = (scope: readonly AiChatRow[]) => void;

export async function removeChatTree(
  deps: {
    readonly chats: ChatDirectory;
    readonly engines: EngineRegistry;
    readonly delivery: AssistantDelivery;
    readonly admit: RemovalAdmission | undefined;
    readonly inactiveOnly?: boolean;
  },
  owner: ChatOwner,
  chatId: string,
): Promise<void> {
  const scope = deps.chats.removalScope(owner, chatId);
  deps.admit?.(scope);
  for (const chat of scope) deps.engines.forMutation(chat, owner.role);
  const ids = scope.map((chat) => chat.id);
  await deps.chats.holdRemoval(
    ids,
    () => {
      deps.admit?.(scope);
      return deps.delivery.suspend(ids, async () => {
        for (const chat of scope) {
          deps.admit?.(scope);
          await deps.engines.forMutation(chat, owner.role)?.historyChanged(chat, owner);
        }
        deps.admit?.(scope);
        await deps.chats.remove(owner, chatId, ids, () => {
          deps.delivery.forget(ids);
        });
      });
    },
    deps.inactiveOnly,
  );
}
