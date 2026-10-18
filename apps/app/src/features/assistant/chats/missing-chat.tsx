import type { ReactNode } from 'react';
import { View } from 'react-native';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { useSyncStatus } from '../../../store/selectors';
import { useArchivedChats } from '../data/archived-chats';
import { setChatArchived } from './chat-actions';
import { ThreadSkeleton } from '../components/thread-skeleton';
import { leaveChat } from './leave-chat';
import { missingChatState, type MissingChatState } from '../model/missing-chat';

function MissingBody({
  state,
  chatId,
  retry,
}: {
  readonly state: MissingChatState;
  readonly chatId: string;
  readonly retry: () => void;
}): ReactNode {
  switch (state) {
    case 'waiting':
    case 'checking':
      return <ThreadSkeleton />;
    case 'failed':
      return (
        <EmptyState
          icon="alert"
          title="Couldn’t load this chat"
          body="Check your connection and try again."
          action={<Button label="Try again" onPress={retry} />}
        />
      );
    case 'archived':
      return (
        <EmptyState
          icon="archive"
          title="This chat is archived"
          body="Restore it to read it and continue the conversation."
          action={
            <Button
              label="Restore chat"
              onPress={() => {
                setChatArchived(chatId, false);
              }}
            />
          }
        />
      );
    case 'gone':
      return (
        <EmptyState
          icon="alert"
          title="This chat isn't available"
          body="It may have been deleted, or it belongs to another profile."
          action={<Button label="Back to chats" onPress={leaveChat} />}
        />
      );
  }
}

export function MissingChat({
  chatId,
  back,
  leading,
}: {
  readonly chatId: string;
  readonly back: boolean;
  readonly leading: readonly HeaderAction[];
}): ReactNode {
  const status = useSyncStatus().status;
  const syncing = status === 'connecting' || status === 'loading';
  const archived = useArchivedChats(!syncing);
  const state = missingChatState(chatId, {
    syncing,
    loading: archived.loading,
    failed: archived.failed,
    archivedIds: archived.entries.map((entry) => entry.id),
  });
  return (
    <Screen
      scroll={false}
      header={
        <PageHeader
          title="Chat"
          back={back}
          settings={mainPageSettings('assistant')}
          search={false}
          actions={leading}
        />
      }
    >
      <View className="flex-1 justify-center">
        <MissingBody state={state} chatId={chatId} retry={archived.retry} />
      </View>
    </Screen>
  );
}
