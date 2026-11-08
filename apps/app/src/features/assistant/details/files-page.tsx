import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { useAiChat, useChatMessages } from '../data/chat-store';
import { FilesTab } from './files-tab';

export function FilesPage(): ReactNode {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const chat = useAiChat(chatId);
  const rows = useChatMessages(chatId);
  return (
    <Screen header={<PageHeader title="Files" search={false} />}>
      {chat === null ? (
        <EmptyState
          compact
          icon="folder"
          title="Chat unavailable"
          body="Open an available chat to see its files."
        />
      ) : (
        <FilesTab key={chat.id} chat={chat} rows={rows} />
      )}
    </Screen>
  );
}
