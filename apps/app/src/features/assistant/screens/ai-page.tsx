import type { ReactNode } from 'react';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { Logger } from '@smarteverything/logging';
import { setAiChatRead } from '../../../api/ai';
import { href } from '../../../app-shell/hrefs';
import { IconButton } from '../../../components/icon-button';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { usePrimaryActionPlacement } from '../../../components/primary-action';
import { Screen } from '../../../components/screen';
import { Text } from '../../../components/text';
import { useForeground } from '../../../design/animation-gate';
import { useSizeClass } from '../../../design/size-class';
import { setLocalPref, useLocalPref } from '../../../store/local-prefs';
import { ChatList } from '../chats/chat-list';
import { ChatThread } from '../chats/chat-thread';
import { ListPane } from '../chats/list-pane';
import { DraftThread, NEW_CHAT_ID } from '../chats/draft-thread';
import { BlockedChat } from '../components/chat-states';
import { useAssistantName, useChatState } from '../data/assistant-data';
import { useAiChat, useAiChats, useChatMessages } from '../data/chat-store';
import { isOpenChat, rememberChat } from '../data/last-chat';
import { markChatSeen } from '../data/recent-chat';
import { useOpenLastChat } from './open-last-chat';

const log = new Logger('app.assistant');

function openChat(chatId: string, inPlace: boolean, messageId?: string): void {
  if (inPlace) {
    router.setParams({ chatId, agent: undefined, message: messageId });
  } else {
    router.push(href.assistantChat(chatId, messageId === undefined ? {} : { message: messageId }));
  }
}

function leaveChat(): void {
  router.back();
}

function useClearChatParam(): void {
  const focused = useIsFocused();
  const { chatId } = useLocalSearchParams<{ chatId?: string }>();
  useEffect(() => {
    if (focused && chatId !== undefined) {
      router.setParams({ chatId: undefined });
    }
  }, [focused, chatId]);
}

function useSeen(chatId: string, remember: boolean, unread: number): void {
  const focused = useIsFocused();
  const foreground = useForeground();
  useEffect(() => {
    if (!focused) {
      return;
    }
    markChatSeen(chatId);
    if (remember) {
      rememberChat(chatId);
    }
  }, [focused, chatId, remember]);
  useEffect(() => {
    if (focused && foreground && unread > 0) {
      setAiChatRead(chatId, true).catch((error: unknown) => {
        log.warn('chat.mark_read_failed', { chatId, reason: String(error) });
      });
    }
  }, [focused, foreground, chatId, unread]);
}

function Thread({
  chatId,
  split,
  leading,
}: {
  readonly chatId: string;
  readonly split: boolean;
  readonly leading: readonly HeaderAction[];
}): ReactNode {
  const chat = useAiChat(chatId);
  const rows = useChatMessages(chatId);
  useSeen(chatId, isOpenChat(chat), chat?.unread_count ?? 0);
  if (chat === null) {
    return (
      <DraftThread
        back={!split}
        leading={leading}
        onStarted={(started) => {
          if (split) {
            openChat(started, true);
          } else {
            router.replace(href.assistantChat(started));
          }
        }}
      />
    );
  }
  return (
    <ChatThread chat={chat} rows={rows} back={!split} leading={leading} onDeleted={leaveChat} />
  );
}

function ColumnHeader({ onCompose }: { readonly onCompose: () => void }): ReactNode {
  return (
    <View className="flex-row items-center justify-between pl-gutter pr-1 pt-2">
      <Text variant="title-3" accessibilityRole="header">
        Chats
      </Text>
      <IconButton icon="pencil" label="New chat" onPress={onCompose} />
    </View>
  );
}

function pushChat(chatId: string, messageId?: string): void {
  openChat(chatId, false, messageId);
}

function PhoneList(): ReactNode {
  const hasChats = useAiChats().some((chat) => chat.archived_at === null);
  const fab = usePrimaryActionPlacement() === 'fab';
  const compose = (): void => {
    pushChat(NEW_CHAT_ID);
  };
  const actions: readonly HeaderAction[] = fab
    ? []
    : [{ icon: 'pencil', label: 'New chat', onPress: compose }];
  if (!hasChats) return <DraftThread back={false} onStarted={pushChat} />;
  return (
    <Screen
      scroll={false}
      header={
        <PageHeader
          title="Chats"
          settings={mainPageSettings('assistant')}
          search={false}
          actions={actions}
        />
      }
    >
      <ChatList selected={null} onOpen={pushChat} onDeleted={() => undefined} onNewChat={compose} />
    </Screen>
  );
}

function useListToggle(shown: boolean): HeaderAction {
  const open = useLocalPref('chatListOpen');
  return {
    icon: 'panelLeft',
    label: shown ? 'Hide chats' : 'Show chats',
    iconOnly: true,
    selected: shown,
    onPress: (): void => {
      setLocalPref('chatListOpen', !open);
    },
  };
}

function SplitPage({ selected }: { readonly selected: string | null }): ReactNode {
  const open = useLocalPref('chatListOpen');
  const shown = open || selected === null;
  const toggle = useListToggle(shown);
  const openFromList = (chatId: string, messageId?: string): void => {
    openChat(chatId, selected !== null, messageId);
  };
  const compose = (): void => {
    openChat(NEW_CHAT_ID, selected !== null);
  };
  return (
    <View className="flex-1 flex-row">
      <ListPane open={shown}>
        <ChatList
          selected={selected}
          top={<ColumnHeader onCompose={compose} />}
          onOpen={openFromList}
          onDeleted={(chatId) => {
            if (chatId === selected) {
              leaveChat();
            }
          }}
          onNewChat={compose}
        />
      </ListPane>
      <View className="min-w-0 flex-1">
        {selected === null ? (
          <DraftThread back={false} leading={[toggle]} onStarted={openFromList} />
        ) : (
          <Thread key={selected} chatId={selected} split leading={[toggle]} />
        )}
      </View>
    </View>
  );
}

function Blocked(): ReactNode {
  const name = useAssistantName();
  const state = useChatState();
  if (state.kind === 'ready') {
    return null;
  }
  return (
    <Screen
      scroll={false}
      header={<PageHeader settings={mainPageSettings('assistant')} title={name} />}
    >
      <View className="flex-1 justify-center">
        <BlockedChat state={state} />
      </View>
    </Screen>
  );
}

export function AiPage(): ReactNode {
  const { split } = useSizeClass();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  useOpenLastChat(split, filter !== undefined);
  useClearChatParam();
  if (useChatState().kind !== 'ready') {
    return <Blocked />;
  }
  return split ? <SplitPage selected={null} /> : <PhoneList />;
}

export function AiChatPage(): ReactNode {
  const { split } = useSizeClass();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  if (useChatState().kind !== 'ready') {
    return <Blocked />;
  }
  return split ? (
    <SplitPage selected={chatId} />
  ) : (
    <Thread chatId={chatId} split={false} leading={[]} />
  );
}
