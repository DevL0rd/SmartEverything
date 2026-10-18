import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { Logger } from '@smarteverything/logging';
import { setAiChatRead } from '../../../api/ai';
import { href } from '../../../app-shell/hrefs';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { OverlayPane } from '../../../components/master-detail';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { useForeground } from '../../../design/animation-gate';
import { ChatFrame } from '../chats/chat-frame';
import { ChatList, type ChatListProps } from '../chats/chat-list';
import {
  closeChatListSlideOver,
  toggleChatList,
  useChatListSlideOver,
} from '../chats/chat-list-toggle';
import { ChatThread } from '../chats/chat-thread';
import { DraftThread, NEW_CHAT_ID } from '../chats/draft-thread';
import { leaveChat, leaveToChatList } from '../chats/leave-chat';
import { ListPane } from '../chats/list-pane';
import { MissingChat } from '../chats/missing-chat';
import { BlockedChat } from '../components/chat-states';
import { useAreaStatus } from '../data/area-status';
import { useAssistantName } from '../data/assistant-data';
import { areaBlocked } from '../model/area-status';
import { useAiChat, useAiChats, useChatMessages } from '../data/chat-store';
import { isOpenChat, rememberChat } from '../data/last-chat';
import { markChatSeen } from '../data/recent-chat';
import type { AiLayout } from '../model/ai-layout';
import { useAiLayout } from '../shell/use-ai-layout';
import { noteChatSeen, useOpenLastChat } from './open-last-chat';
import { useOpenerFocus } from './use-opener-focus';

const log = new Logger('app.assistant');

const NO_ACTIONS: readonly HeaderAction[] = [];

function openChat(chatId: string, inPlace: boolean, messageId?: string): void {
  if (inPlace) {
    router.setParams({ chatId, agent: undefined, message: messageId });
  } else {
    router.push(href.assistantChat(chatId, messageId === undefined ? {} : { message: messageId }));
  }
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
      return undefined;
    }
    markChatSeen(chatId);
    noteChatSeen();
    if (remember) {
      rememberChat(chatId);
    }
    return noteChatSeen;
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
  wide,
  leading,
}: {
  readonly chatId: string;
  readonly wide: boolean;
  readonly leading: readonly HeaderAction[];
}): ReactNode {
  const chat = useAiChat(chatId);
  const rows = useChatMessages(chatId);
  useSeen(chatId, isOpenChat(chat), chat?.unread_count ?? 0);
  if (chat === null && chatId !== NEW_CHAT_ID) {
    return <MissingChat chatId={chatId} back={!wide} leading={leading} />;
  }
  if (chat === null) {
    return (
      <DraftThread
        back={!wide}
        leading={leading}
        onStarted={(started) => {
          if (wide) {
            openChat(started, true);
          } else {
            router.replace(href.assistantChat(started));
          }
        }}
      />
    );
  }
  return (
    <ChatThread
      chat={chat}
      rows={rows}
      back={!wide}
      leading={leading}
      onDeleted={wide ? leaveToChatList : leaveChat}
    />
  );
}

function useListToggle(shown: boolean): HeaderAction {
  return {
    icon: 'panelLeft',
    label: shown ? 'Hide chats' : 'Show chats',
    iconOnly: true,
    selected: shown,
    shortcut: '⌘\\',
    onPress: toggleChatList,
  };
}

function SlideOverList({
  open,
  selected,
  onOpen,
  onDeleted,
  onNewChat,
}: {
  readonly open: boolean;
  readonly selected: string | null;
  readonly onOpen: (chatId: string, messageId?: string) => void;
  readonly onDeleted: (chatId: string) => void;
  readonly onNewChat: () => void;
}): ReactNode {
  useOpenerFocus(open);
  return (
    <OverlayPane open={open} onDismiss={closeChatListSlideOver} label="Chats">
      <View className="flex-1 pt-safe">
        <ChatList
          kind="slide-over"
          focusSearch
          selected={selected}
          onOpen={(chatId, messageId) => {
            closeChatListSlideOver();
            onOpen(chatId, messageId);
          }}
          onDeleted={onDeleted}
          onNewChat={() => {
            closeChatListSlideOver();
            onNewChat();
          }}
        />
      </View>
    </OverlayPane>
  );
}

function Conversation({
  selected,
  wide,
  toggle,
  onStarted,
}: {
  readonly selected: string | null;
  readonly wide: boolean;
  readonly toggle: HeaderAction;
  readonly onStarted: (chatId: string) => void;
}): ReactNode {
  if (areaBlocked(useAreaStatus())) {
    return wide ? <BlockedPane /> : <Blocked />;
  }
  const leading = wide ? [toggle] : NO_ACTIONS;
  return selected === null ? (
    <DraftThread back={false} leading={leading} onStarted={onStarted} />
  ) : (
    <Thread key={selected} chatId={selected} wide={wide} leading={leading} />
  );
}

function usePhoneList(wide: boolean, selected: string | null): boolean {
  const hasChats = useAiChats().some((chat) => chat.archived_at === null);
  const blocked = areaBlocked(useAreaStatus());
  return !wide && selected === null && (hasChats || blocked);
}

function ListSlot({
  wide,
  phoneList,
  open,
  list,
}: {
  readonly wide: boolean;
  readonly phoneList: boolean;
  readonly open: boolean;
  readonly list: ChatListProps;
}): ReactNode {
  return (
    <ListPane open={open || phoneList} full={phoneList}>
      {wide || phoneList ? <ChatList {...list} kind={wide ? 'pane' : 'screen'} /> : null}
    </ListPane>
  );
}

function useChatNav(selected: string | null): {
  readonly openFromList: ChatListProps['onOpen'];
  readonly compose: () => void;
  readonly onDeleted: (chatId: string) => void;
} {
  const openFromList: ChatListProps['onOpen'] = (chatId, messageId) => {
    openChat(chatId, selected !== null, messageId);
  };
  const compose = (): void => {
    openChat(NEW_CHAT_ID, selected !== null);
  };
  const onDeleted = (chatId: string): void => {
    if (chatId === selected) leaveToChatList();
  };
  return { openFromList, compose, onDeleted };
}

function SplitPage({
  selected,
  layout,
}: {
  readonly selected: string | null;
  readonly layout: AiLayout;
}): ReactNode {
  const wide = layout.mode !== 'stack';
  const phoneList = usePhoneList(wide, selected);
  const slideOver = useChatListSlideOver(layout.mode === 'overlay' || layout.listSuppressed);
  const toggle = useListToggle(layout.listPane || slideOver);
  const { openFromList, compose, onDeleted } = useChatNav(selected);
  return (
    <ChatFrame
      list={
        <ListSlot
          wide={wide}
          phoneList={phoneList}
          open={layout.listPane}
          list={{
            kind: 'pane',
            selected,
            onOpen: openFromList,
            onDeleted,
            onNewChat: compose,
          }}
        />
      }
      conversation={
        phoneList ? null : (
          <Conversation selected={selected} wide={wide} toggle={toggle} onStarted={openFromList} />
        )
      }
      slideOver={
        <SlideOverList
          open={slideOver}
          selected={selected}
          onOpen={openFromList}
          onDeleted={onDeleted}
          onNewChat={compose}
        />
      }
    />
  );
}

function BlockedPane(): ReactNode {
  const state = useAreaStatus();
  if (!areaBlocked(state)) {
    return null;
  }
  return (
    <View className="flex-1 justify-center">
      <BlockedChat state={state} />
    </View>
  );
}

function Blocked(): ReactNode {
  const name = useAssistantName();
  const state = useAreaStatus();
  if (!areaBlocked(state)) {
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
  const layout = useAiLayout();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  useOpenLastChat(layout.mode !== 'stack', filter !== undefined);
  useClearChatParam();
  return <SplitPage selected={null} layout={layout} />;
}

export function AiChatPage(): ReactNode {
  const layout = useAiLayout();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  return <SplitPage selected={chatId} layout={layout} />;
}
