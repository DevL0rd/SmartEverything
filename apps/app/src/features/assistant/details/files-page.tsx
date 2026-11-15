import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EmptyState } from '../../../components/empty-state';
import { PageShell } from '../../../components/page-shell/page-shell';
import { useAiChat, useChatMessages } from '../data/chat-store';
import { FilesTab } from './files-tab';

export function FilesPage(): ReactNode {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const chat = useAiChat(chatId);
  const rows = useChatMessages(chatId);
  return (
    <PageShell title="Files">
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
    </PageShell>
  );
}
