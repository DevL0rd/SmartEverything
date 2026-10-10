import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Text } from '../../../components/text';
import { useSizeClass } from '../../../design/size-class';
import { ChatList } from '../chats/chat-list';
import { ChatThread } from '../chats/chat-thread';
import { NewChatSheet } from '../chats/new-chat-sheet';
import { StartChat } from '../chats/start-chat';
import { BlockedChat } from '../components/chat-states';
import { useAssistantName, useChatState } from '../data/assistant-data';
import {
  useAiChat,
  useAiChats,
  useChatMessages,
  useChatTurn,
  useLatestChatId,
} from '../data/chat-store';
import { markChatSeen } from '../data/recent-chat';
import { settingsItem } from '../../../settings/settings-item';

function useSelected(split: boolean): string | null {
  const { chat } = useLocalSearchParams<{ chat?: string }>();
  const latest = useLatestChatId();
  return chat ?? (split ? latest : null);
}

function openChat(chatId: string, split: boolean): void {
  if (split) {
    router.setParams({ chat: chatId });
  } else {
    router.push(href.assistantChat(chatId));
  }
}

function useSeen(chatId: string): void {
  const focused = useIsFocused();
  useEffect(() => {
    if (focused) {
      markChatSeen(chatId);
    }
  }, [focused, chatId]);
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
  const turn = useChatTurn(chatId);
  useSeen(chatId);
  if (chat === null) {
    return <StartChat split={split} />;
  }
  return (
    <ChatThread
      chat={chat}
      rows={rows}
      turn={turn}
      back={!split}
      leading={leading}
      onDeleted={() => {
        router.setParams({ chat: undefined });
      }}
    />
  );
}

const COLUMN_MENU: readonly MenuItem[] = [
  {
    label: 'Costs',
    icon: 'trendUp',
    onPress: (): void => {
      router.push(href.assistantCosts());
    },
  },
  settingsItem(href.settings.assistant()),
];

function ColumnHeader({ onCompose }: { readonly onCompose: () => void }): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(COLUMN_MENU, 'Chats');
  return (
    <View className="flex-row items-center justify-between pt-2 pl-2">
      <Text variant="title-3">Chats</Text>
      <View className="flex-row">
        <IconButton icon="pencil" label="New chat" onPress={onCompose} />
        <View ref={ref}>
          <IconButton icon="ellipsisVertical" label="More" onPress={open} />
        </View>
      </View>
      {menu}
    </View>
  );
}

function useCreating(onCreated: (chatId: string) => void): {
  readonly start: () => void;
  readonly sheet: ReactNode;
} {
  const [creating, setCreating] = useState(false);
  return {
    start: (): void => {
      setCreating(true);
    },
    sheet: (
      <NewChatSheet
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onCreated={(chat) => {
          setCreating(false);
          onCreated(chat.id);
        }}
      />
    ),
  };
}

function ListColumn({
  selected,
  split,
  top,
}: {
  readonly selected: string | null;
  readonly split: boolean;
  readonly top?: ReactNode;
}): ReactNode {
  return (
    <ChatList
      selected={selected}
      top={top}
      onOpen={(chatId) => {
        openChat(chatId, split);
      }}
      onDeleted={() => {
        router.setParams({ chat: undefined });
      }}
    />
  );
}

function PhoneList(): ReactNode {
  const creating = useCreating((chatId) => {
    openChat(chatId, false);
  });
  const hasChats = useAiChats().some((chat) => chat.archived_at === null);
  const compose: HeaderAction = { icon: 'pencil', label: 'New chat', onPress: creating.start };
  return (
    <Screen
      scroll={false}
      header={
        <PageHeader title="Chats" search={false} actions={[compose]} overflow={COLUMN_MENU} />
      }
    >
      {hasChats ? <ListColumn selected={null} split={false} /> : <StartChat split={false} />}
      {creating.sheet}
    </Screen>
  );
}

function SplitPage({ selected }: { readonly selected: string | null }): ReactNode {
  const { width } = useSizeClass();
  const roomy = width === 'large' || width === 'xlarge';
  const [listOpen, setListOpen] = useState(roomy);
  const creating = useCreating((chatId) => {
    openChat(chatId, true);
  });
  const shown = roomy || listOpen || selected === null;
  const toggle: HeaderAction = {
    icon: 'panelLeft',
    label: shown ? 'Hide chats' : 'Show chats',
    iconOnly: true,
    selected: shown,
    onPress: (): void => {
      setListOpen(!listOpen);
    },
  };
  return (
    <View className="flex-1 flex-row">
      {shown ? (
        <View className="w-master border-r border-outline-variant pt-safe">
          <ListColumn selected={selected} split top={<ColumnHeader onCompose={creating.start} />} />
        </View>
      ) : null}
      <View className="min-w-0 flex-1">
        {selected === null ? (
          <StartChat split />
        ) : (
          <Thread key={selected} chatId={selected} split leading={roomy ? [] : [toggle]} />
        )}
      </View>
      {creating.sheet}
    </View>
  );
}

export function AiPage(): ReactNode {
  const { split } = useSizeClass();
  const selected = useSelected(split);
  const name = useAssistantName();
  const state = useChatState();
  if (state.kind !== 'ready') {
    return (
      <Screen scroll={false} header={<PageHeader title={name} />}>
        <View className="flex-1 justify-center">
          <BlockedChat state={state} />
        </View>
      </Screen>
    );
  }
  if (split) {
    return <SplitPage selected={selected} />;
  }
  return selected === null ? (
    <PhoneList />
  ) : (
    <Thread chatId={selected} split={false} leading={[]} />
  );
}
