import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AssistantMessageRow, MessageSource } from '@smarteverything/domain';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import { useRow } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { pluginIcon } from '../../plugins';
import { SourceMark } from '../chats/source-mark';
import { usePluginNames } from '../data/plugin-names';
import type { MessageItem } from '../data/thread';
import type { ChatSource } from '../model/chat-source';
import { sourceLabelOf } from '../model/speaker';
import type { MessageActions } from './message-actions';
import { Markdown } from './markdown/markdown';
import { readableText } from './markdown/parse';
import { speakerInk } from './speaker-avatar';
import { Attachments } from './attachments';
import { TextClamp } from './text-clamp';
import { useIdiom } from '../../../design/platform';
import type { ColourRole } from '../../../design/tokens';

const SOURCE_ICON: Readonly<Record<MessageSource, IconName>> = {
  app: 'sparkles',
  voice: 'phone',
  plugin: 'puzzle',
  wake: 'camera',
  subagent: 'sparkles',
  schedule: 'timer',
  chat: 'messageCircle',
};

const APP_SOURCE: ChatSource = { kind: 'app', pluginId: null, label: '', filterKey: null };

export function useTimeZone(): string | null {
  return useStoreSelector((state) => state.settings?.time_zone ?? null);
}

function useBadgeIcon(row: AssistantMessageRow): IconName {
  const plugin = useRow('plugins', row.origin?.plugin_id ?? null);
  if (row.origin === null) {
    return 'sparkles';
  }
  if (row.origin.source === 'plugin') {
    return plugin === null ? 'puzzle' : pluginIcon(plugin.manifest);
  }
  return SOURCE_ICON[row.origin.source];
}

function SourceBadge({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const plugins = usePluginNames();
  const icon = useBadgeIcon(row);
  const label = sourceLabelOf(row, plugins);
  if (label === null) {
    return null;
  }
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-1.5 pr-2">
      <Icon name={icon} size={16} tone="variant" />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function RunHeader({
  item,
  ai,
  inset,
}: {
  readonly item: MessageItem;
  readonly ai: boolean;
  readonly inset: boolean;
}): ReactNode {
  const { row, speaker } = item;
  const timeZone = useTimeZone();
  return (
    <View
      className={
        inset ? 'mb-1 ml-3 flex-row items-center gap-2' : 'mb-2 flex-row items-center gap-2'
      }
    >
      {ai ? <SourceMark source={APP_SOURCE} size={20} /> : null}
      <Text
        variant="caption"
        className={
          ai
            ? 'font-sans-semibold text-on-surface'
            : `font-sans-semibold ${speakerInk(speaker.name)}`
        }
        numberOfLines={1}
      >
        {speaker.name}
      </Text>
      <SourceBadge row={row} />
      <Text variant="caption" tone="variant" className="tabular">
        {clock(row.created_at, timeZone)}
      </Text>
    </View>
  );
}

export function messageLabel(item: MessageItem, timeZone: string | null): string {
  const who = item.speaker.kind === 'me' ? 'You' : item.speaker.name;
  return `${who}, ${clock(item.row.created_at, timeZone)}: ${readableText(item.row.text)}`;
}

export function MessageText({
  item,
  actions,
  selectable,
}: {
  readonly item: MessageItem;
  readonly actions: MessageActions;
  readonly selectable: boolean;
}): ReactNode {
  const timeZone = useTimeZone();
  return (
    <View accessible accessibilityLabel={messageLabel(item, timeZone)} {...actions.accessibility}>
      <Markdown text={item.row.text} selectable={selectable} />
    </View>
  );
}

export function BubbleContent({
  item,
  actions,
  fades,
}: {
  readonly item: MessageItem;
  readonly actions: MessageActions;
  readonly fades: readonly ColourRole[];
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const timeZone = useTimeZone();
  const { row } = item;
  return (
    <TextClamp fades={fades}>
      <View className="gap-2">
        {row.attachments.length === 0 ? null : <Attachments attachments={row.attachments} />}
        {row.text === '' ? null : (
          <View
            accessible
            accessibilityLabel={messageLabel(item, timeZone)}
            {...actions.accessibility}
          >
            <Markdown text={row.text} selectable={pointer} />
          </View>
        )}
      </View>
    </TextClamp>
  );
}

export function MessagePreview({
  item,
  className,
}: {
  readonly item: MessageItem;
  readonly className: string;
}): ReactNode {
  return (
    <View className={`max-w-full rounded-xl px-4 py-2.5 ${className}`}>
      <Text variant="body" numberOfLines={6}>
        {readableText(item.row.text)}
      </Text>
    </View>
  );
}

export function BarTime({ item }: { readonly item: MessageItem }): ReactNode {
  const timeZone = useTimeZone();
  return (
    <Text variant="caption" tone="variant" className="tabular px-2">
      {clock(item.row.created_at, timeZone)}
    </Text>
  );
}
