import type { ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AI_CHAT_TITLE_MAX, type AiChatRow } from '@smarteverything/domain';
import { TextEditSheet } from '../../../settings/text-edit-sheet';
import { changeChat } from './chat-actions';

class ChatRenameError extends Error {
  public constructor() {
    super('Couldn’t save the chat title. Try again.');
    this.name = 'ChatRenameError';
  }
}

function ChatRenameSheet({
  chat,
  onClose,
}: {
  readonly chat: Pick<AiChatRow, 'id' | 'title'>;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <TextEditSheet
      request={{
        id: chat.id,
        title: 'Rename chat',
        label: 'Chat title',
        initial: chat.title,
        placeholder: 'Enter a title',
        confirmLabel: 'Rename',
        maxLength: AI_CHAT_TITLE_MAX,
        save: async (title) => {
          if ((await changeChat(chat.id, { title })) === null) throw new ChatRenameError();
        },
      }}
      onClose={onClose}
    />
  );
}

export function RoutedChatRename({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const { operation } = useLocalSearchParams<{ operation?: string }>();
  return operation === 'rename' ? (
    <ChatRenameSheet
      chat={chat}
      onClose={() => {
        router.setParams({ operation: undefined });
      }}
    />
  ) : null;
}
