import type { ReactNode } from 'react';
import { useState } from 'react';
import { AI_CHAT_TITLE_MAX, type AiChatRow } from '@smarteverything/domain';
import type { MenuItem } from '../../../components/menu';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { useStoreSelector } from '../../../store/store-context';
import { changeChat, deleteChat } from './chat-actions';

export function renameRequest(chat: AiChatRow): TextEditRequest {
  return {
    title: 'Rename chat',
    label: 'Name',
    initial: chat.title,
    placeholder: chat.title,
    confirmLabel: 'Rename',
    maxLength: AI_CHAT_TITLE_MAX,
    save: async (title: string): Promise<void> => {
      await changeChat(chat.id, { title });
    },
  };
}

export function chatMenuOf(
  chat: AiChatRow,
  rename: () => void,
  onDeleted: () => void,
): readonly MenuItem[] {
  return [
    { label: 'Rename', icon: 'pencil', onPress: rename },
    {
      label: chat.pinned ? 'Unpin' : 'Pin',
      icon: 'star',
      onPress: (): void => {
        void changeChat(chat.id, { pinned: !chat.pinned });
      },
    },
    {
      label: 'Delete',
      icon: 'trash',
      destructive: true,
      onPress: (): void => {
        void deleteChat(chat).then((gone) => {
          if (gone) {
            onDeleted();
          }
        });
      },
    },
  ];
}

export interface ChatMenu {
  readonly itemsOf: (chatId: string) => readonly MenuItem[];
  readonly host: ReactNode;
}

export function useChatMenu(onDeleted: (chatId: string) => void): ChatMenu {
  const chats = useStoreSelector((state) => state.tables.ai_chats.byId);
  const [renaming, setRenaming] = useState<TextEditRequest | null>(null);
  return {
    itemsOf: (chatId: string): readonly MenuItem[] => {
      const chat = chats[chatId];
      return chat === undefined
        ? []
        : chatMenuOf(
            chat,
            () => {
              setRenaming(renameRequest(chat));
            },
            () => {
              onDeleted(chat.id);
            },
          );
    },
    host: (
      <TextEditSheet
        request={renaming}
        onClose={() => {
          setRenaming(null);
        }}
      />
    ),
  };
}
