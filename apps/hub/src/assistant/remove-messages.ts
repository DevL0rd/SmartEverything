import { admitChatExecution } from './native-helpers';
import type { AiChatRow } from '@smarteverything/domain';
import { ownedChat, type ChatDirectory, type ChatOwner } from './chat-directory';
import type { Store } from '../store/store';
import type { EngineRegistry } from './engines/registry';
import type { AssistantFiles } from './files';
import { isHelperDialogueMirror } from './delegation/relay-speaker';

export async function removeConversationMessages(
  deps: { readonly store: Store; readonly files: AssistantFiles; readonly engines: EngineRegistry },
  owner: ChatOwner,
  ids: readonly string[],
): Promise<void> {
  const { assistantChat } = deps.store;
  const rows = ids.map((id) => assistantChat.message(id));
  for (const chatId of new Set(rows.map((row) => row.chat_id)))
    ownedChat(deps.store, owner, chatId);
  const history = rows.filter((row) => !isHelperDialogueMirror(row));
  for (const chatId of new Set(history.map((row) => row.chat_id))) {
    const chat = deps.store.aiChats.chat(chatId);
    admitChatExecution(chat);
    const engine = deps.engines.forMutation(chat, owner.role);
    await engine?.historyChanged(chat, owner);
    engine?.historyRemoved?.(
      chat,
      history.filter((row) => row.chat_id === chat.id),
    );
  }
  await deps.files.remove(assistantChat.removeMessages(ids));
}

export function mutableChat(
  chats: ChatDirectory,
  engines: EngineRegistry,
  owner: ChatOwner,
  chatId: string,
): AiChatRow {
  const chat = chats.own(owner, chatId);
  admitChatExecution(chat);
  engines.forMutation(chat, owner.role);
  return chat;
}
