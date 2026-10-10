import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Dot } from '../../../components/badge';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { useContextMenu, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { ChatEntry } from './chat-entry';

export const CHAT_ROW_HEIGHT = 64;

function TitleLine({ entry }: { readonly entry: ChatEntry }): ReactNode {
  const now = useMinute();
  return (
    <View className="flex-row items-center gap-1.5">
      {entry.call ? <Icon name="phone" size={16} tone="variant" /> : null}
      <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
        {entry.title}
      </Text>
      {entry.state === 'working' ? <Dot tone="primary" /> : null}
      {entry.state === 'failed' ? <Dot tone="critical" /> : null}
      <Text variant="caption" tone="faint">
        {relative(entry.at, now)}
      </Text>
    </View>
  );
}

export function ChatRow({
  entry,
  selected,
  onOpen,
  menu,
}: {
  readonly entry: ChatEntry;
  readonly selected: boolean;
  readonly onOpen: () => void;
  readonly menu: readonly MenuItem[];
}): ReactNode {
  const context = useContextMenu(menu, entry.title);
  return (
    <Interactive
      label={entry.title}
      selected={selected}
      onPress={onOpen}
      onLongPress={context.onLongPress}
      onContextMenu={context.onContextMenu}
      className={cn(
        'mx-2 h-chat-row justify-center gap-0.5 rounded-lg px-3',
        entry.nested && 'ml-6',
        selected && 'bg-surface-3',
      )}
      layerClassName="rounded-lg"
    >
      <TitleLine entry={entry} />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {entry.preview ?? (entry.empty ? 'No messages yet' : '')}
      </Text>
      {context.host}
    </Interactive>
  );
}
