import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SearchField } from '../../../components/search-field';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { useStoreSelector } from '../../../store/store-context';
import { useChatGroups } from '../data/chat-store';
import { listItemsOf, type ChatListItem } from './chat-entry';
import { useChatMenu } from './chat-menu';
import { CHAT_ROW_HEIGHT, ChatRow } from './chat-row';
import { matchesChat } from './entries';

const HEADER_HEIGHT = 40;

const heightOf = (item: ChatListItem): number =>
  item.type === 'header' ? HEADER_HEIGHT : CHAT_ROW_HEIGHT;

export interface ChatListProps {
  readonly selected: string | null;
  readonly onOpen: (chatId: string) => void;
  readonly onDeleted: (chatId: string) => void;
  readonly top?: ReactNode;
}

function useItems(query: string): readonly ChatListItem[] {
  const groups = useChatGroups(false);
  const now = useMinute();
  const timeZone = useStoreSelector((state) => state.settings?.time_zone ?? null);
  const needle = query.trim().toLowerCase();
  return useMemo(
    () =>
      listItemsOf(
        needle === '' ? groups : groups.filter((group) => matchesChat(group, needle)),
        now,
        timeZone,
      ),
    [groups, needle, now, timeZone],
  );
}

function Header({ title }: { readonly title: string }): ReactNode {
  return (
    <View className="h-list-header w-full justify-end bg-bg px-5 pb-1">
      <Text variant="label" tone="variant">
        {title}
      </Text>
    </View>
  );
}

function offsetsOf(items: readonly ChatListItem[]): readonly number[] {
  return items.reduce<number[]>(
    (all, item, index) => [...all, (all[index] ?? 0) + heightOf(item)],
    [0],
  );
}

function NoChats({ query }: { readonly query: string }): ReactNode {
  return (
    <Text variant="callout" tone="variant" className="px-5 py-3">
      {query.trim() === '' ? 'No chats yet' : `No chat matches “${query.trim()}”.`}
    </Text>
  );
}

export function ChatList({ selected, onOpen, onDeleted, top }: ChatListProps): ReactNode {
  const [query, setQuery] = useState('');
  const items = useItems(query);
  const menu = useChatMenu(onDeleted);
  const offsets = offsetsOf(items);
  const sticky = items.flatMap((item, index) => (item.type === 'header' ? [index] : []));
  return (
    <View className="min-h-0 flex-1">
      <View className="gap-2 px-3 pb-2">
        {top}
        <SearchField value={query} onChange={setQuery} placeholder="Search chats" variant="field" />
      </View>
      {items.length === 0 ? <NoChats query={query} /> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        stickyHeaderIndices={sticky}
        getItemLayout={(_data, index) => ({
          length: (offsets[index + 1] ?? 0) - (offsets[index] ?? 0),
          offset: offsets[index] ?? 0,
          index,
        })}
        initialNumToRender={14}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-section-gap"
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <Header title={item.title} />
          ) : (
            <ChatRow
              entry={item.entry}
              selected={selected === item.entry.id}
              onOpen={() => {
                onOpen(item.entry.id);
              }}
              menu={menu.itemsOf(item.entry.id)}
            />
          )
        }
      />
      {menu.host}
    </View>
  );
}
