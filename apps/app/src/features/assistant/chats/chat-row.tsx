import { isComputerEngine } from '../provider/computer-engine';
import type { ReactNode } from 'react';
import { memo, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { CountPill } from '../../../components/badge';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { useContextMenu } from '../../../components/menu';
import { SwipeRow, swipeAccessibility } from '../../../components/swipe-row';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { entering, exiting, useMotion } from '../../../design/motion';
import { useIdiom } from '../../../design/platform';
import { useIsOwner, useRow } from '../../../store/selectors';
import { useMinute } from '../../../store/clock';
import { TypingDots } from '../components/typing-dots';
import { chatListTime } from '../model/chat-list-time';
import { childChatIcon } from '../model/child-chat-icon';
import { sameEntry, type ChatEntry, type FailedChatLine, type PreviewChatLine } from './chat-entry';
import { HOVER_BAR, ROW_EXIT, UNREAD_PULSE, arrivedJustNow } from './list-motion';
import { menuOf, swipeActionsOf } from './row-actions';
import { SourceMark } from './source-mark';

export interface ChatRowProps {
  readonly entry: ChatEntry;
  readonly nested: boolean;
  readonly inactive?: boolean;
  readonly selected: boolean;
  readonly timeZone: string | null;
  readonly onOpen: (chatId: string) => void;
  readonly onDeleted: (chatId: string) => void;
}

function a11yLabelOf(entry: ChatEntry): string {
  const line = entry.line;
  const state =
    line.kind === 'preview'
      ? `${line.speaker === null ? '' : `${line.speaker}: `}${line.text}`
      : line.kind === 'working'
        ? 'Working'
        : line.kind === 'failed'
          ? `Failed, ${line.reason}`
          : '';
  const unread = entry.unread > 0 ? `${String(entry.unread)} unread` : '';
  const pinned = entry.pinned ? 'Pinned' : '';
  return [entry.title, entry.source.label, pinned, unread, state]
    .filter((part) => part !== '')
    .join(', ');
}

function WorkingLine({ step }: { readonly step: string | null }): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      <Text variant="footnote" tone="primary" numberOfLines={1} className="shrink">
        {step === null ? 'Working' : `Working · ${step}`}
      </Text>
      <TypingDots tone="primary" />
    </View>
  );
}

function FailedLine({ line }: { readonly line: FailedChatLine }): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
      <Icon name="alert" size={16} tone="critical" />
      <Text variant="footnote" tone="critical" numberOfLines={1} className="shrink">
        {`${line.sent ? 'Failed' : 'Not sent'} · ${line.reason}`}
      </Text>
    </View>
  );
}

function PlainLine({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
      {text}
    </Text>
  );
}

function PreviewLine({
  entry,
  line,
}: {
  readonly entry: ChatEntry;
  readonly line: PreviewChatLine;
}): ReactNode {
  const branch = entry.source.kind === 'branch' && entry.kind !== 'subagent';
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
      {branch ? <Icon name="gitBranch" size={16} tone="variant" /> : null}
      <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
        {branch ? 'Branch · ' : ''}
        {line.speaker === null ? '' : `${line.speaker}: `}
        {line.text}
      </Text>
    </View>
  );
}

function Line({ entry }: { readonly entry: ChatEntry }): ReactNode {
  const { line } = entry;
  switch (line.kind) {
    case 'working':
      return <WorkingLine step={line.step} />;
    case 'failed':
      return <FailedLine line={line} />;
    case 'archived':
      return <PlainLine text="Archived" />;
    case 'empty':
      return <PlainLine text="No messages yet" />;
    case 'preview':
      return <PreviewLine entry={entry} line={line} />;
  }
}

function Unread({ entry }: { readonly entry: ChatEntry }): ReactNode {
  const motion = useMotion();
  if (entry.unread === 0) {
    return null;
  }
  const pulse = arrivedJustNow(entry.at) ? entering(motion, UNREAD_PULSE) : {};
  return (
    <Animated.View {...pulse}>
      <CountPill count={entry.unread} />
    </Animated.View>
  );
}

function Trailing({ entry }: { readonly entry: ChatEntry }): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <Unread entry={entry} />
      {entry.pinned && !entry.archived ? <Icon name="pin" size={16} tone="variant" /> : null}
    </View>
  );
}

function HoverActions({ entry }: { readonly entry: ChatEntry }): ReactNode {
  const { leading, trailing } = swipeActionsOf(entry);
  return (
    <Animated.View entering={HOVER_BAR} className="absolute right-2 top-1 flex-row items-center">
      {leading === undefined ? null : (
        <IconButton icon={leading.icon} label={leading.label} onPress={leading.onCommit} />
      )}
      <IconButton icon={trailing.icon} label={trailing.label} onPress={trailing.onCommit} />
    </Animated.View>
  );
}

function Connector(): ReactNode {
  return (
    <View
      aria-hidden
      pointerEvents="none"
      className="absolute -top-3 bottom-1/2 left-gutter ml-1 w-5 rounded-bl-xl border-b border-l border-outline-variant"
    />
  );
}

function Body({
  entry,
  timeZone,
  hovered,
  compact,
  inactive,
}: {
  readonly entry: ChatEntry;
  readonly timeZone: string | null;
  readonly hovered: boolean;
  readonly compact: boolean;
  readonly inactive: boolean;
}): ReactNode {
  const now = useMinute();
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-center gap-2">
        <Text
          variant={inactive ? 'footnote' : compact ? 'label' : 'body-strong'}
          numberOfLines={1}
          className={cn('min-w-0 flex-1', entry.unread > 0 && 'font-sans-semibold')}
        >
          {entry.title}
        </Text>
        <Text variant="caption" tone="variant" className={cn('tabular', hovered && 'opacity-0')}>
          {chatListTime(entry.at, now, timeZone)}
        </Text>
      </View>
      {inactive ? (
        <Trailing entry={entry} />
      ) : (
        <View className="flex-row items-center gap-2">
          <Line entry={entry} />
          <Trailing entry={entry} />
        </View>
      )}
    </View>
  );
}

function useRowMenu(
  entry: ChatEntry,
  onDeleted: ChatRowProps['onDeleted'],
): ReturnType<typeof menuOf> {
  const owner = useIsOwner();
  const chat = useRow('ai_chats', entry.id);
  const readOnly = chat !== null && isComputerEngine(chat.engine) && !owner;
  return menuOf(entry, { onDeleted }).filter((item) => !readOnly || item.icon !== 'trash');
}

function RowContent({
  entry,
  nested,
  selected,
  timeZone,
  hovered,
  child,
  inactive,
}: Pick<ChatRowProps, 'entry' | 'nested' | 'selected' | 'timeZone'> & {
  readonly hovered: boolean;
  readonly child: boolean;
  readonly inactive: boolean;
}): ReactNode {
  return (
    <>
      {selected ? (
        <View className="absolute inset-y-2 left-0 w-0.75 rounded-r-sm bg-primary" />
      ) : null}
      {nested ? <View className="w-6" /> : null}
      {child ? (
        <View aria-hidden className="size-5 items-center justify-center">
          <Icon name={childChatIcon(entry.id)} size={16} tone={selected ? 'primary' : 'variant'} />
        </View>
      ) : (
        <SourceMark source={entry.source} size={40} />
      )}
      <Body
        entry={entry}
        timeZone={timeZone}
        hovered={hovered}
        compact={child}
        inactive={inactive}
      />
    </>
  );
}

function rowFrame(child: boolean, inactive: boolean, selected: boolean): string {
  return cn(
    'flex-row items-center px-gutter',
    inactive
      ? 'min-h-touch-min gap-2 py-0.5'
      : child
        ? 'min-h-touch-min gap-2 py-1.5'
        : 'min-h-chat-row gap-3 py-3',
    selected && 'bg-primary/12',
  );
}

function Row({
  entry,
  nested,
  selected,
  timeZone,
  onOpen,
  onDeleted,
  inactive = false,
}: ChatRowProps): ReactNode {
  const motion = useMotion();
  const child = entry.kind === 'subagent';
  const [hovered, setHovered] = useState(false);
  const menu = useContextMenu(useRowMenu(entry, onDeleted), entry.title);
  const { leading, trailing } = swipeActionsOf(entry);
  const hoverShown = useIdiom() === 'pointer' && hovered;
  return (
    <Animated.View
      {...exiting(motion, ROW_EXIT)}
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      className={cn('relative', entry.archived && 'opacity-80')}
    >
      <SwipeRow leading={leading} trailing={trailing}>
        <Interactive
          label={a11yLabelOf(entry)}
          selected={selected}
          onPress={() => {
            onOpen(entry.id);
          }}
          onLongPress={menu.onLongPress}
          onContextMenu={menu.onContextMenu}
          {...swipeAccessibility(leading, trailing)}
          className={rowFrame(child, inactive, selected)}
        >
          <RowContent
            {...{ entry, nested, selected, timeZone, child, inactive }}
            hovered={hoverShown}
          />
        </Interactive>
      </SwipeRow>
      {nested ? <Connector /> : null}
      {hoverShown ? <HoverActions entry={entry} /> : null}
      {menu.host}
    </Animated.View>
  );
}

export const ChatRow = memo(
  Row,
  (left, right) =>
    sameEntry(left.entry, right.entry) &&
    left.nested === right.nested &&
    left.inactive === right.inactive &&
    left.selected === right.selected &&
    left.timeZone === right.timeZone &&
    left.onOpen === right.onOpen &&
    left.onDeleted === right.onDeleted,
);
