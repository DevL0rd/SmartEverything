import type { AssistantMessageRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { memo, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { CountPill } from '../../../components/badge';
import { BrandGlyph } from '../../../components/brand-glyphs';
import { NATIVE_CHAT_BRANDS } from './native-chat-brand';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { useContextMenu, type MenuItem } from '../../../components/menu';
import { StatusDot } from '../../../components/status-dot';
import { SwipeRow, swipeAccessibility } from '../../../components/swipe-row';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { entering, exiting, useMotion } from '../../../design/motion';
import { useIdiom } from '../../../design/platform';
import { useKeyboardRow } from '../../../components/keyboard-list';
import { useIsOwner } from '../../../store/selectors';
import { useEntityStore } from '../../../store/store-context';
import { useMinute } from '../../../store/clock';
import { chatListTime } from '../model/chat-list-time';
import { sameEntry, type ChatEntry } from './chat-entry';
import { AgentMark } from './agent-mark';
import { HOVER_BAR, ROW_EXIT, ROW_REORDER, UNREAD_PULSE, arrivedJustNow } from './list-motion';
import { Line, a11yLabelOf, statusOf, type Status } from './row-lines';
import { useRowLine, type RowLine } from './row-status';
import { menuOf, rowSwipeOf } from './row-actions';
import { ComputerMark } from './computer-mark';
import { avatarOf } from './row-avatar';
import { SourceMark } from './source-mark';
import { useDeleteKey } from './use-delete-key';

export interface ChatRowProps {
  readonly entry: ChatEntry;
  readonly agent: boolean;
  readonly agentCount: number;
  readonly agentsRunning: number;
  readonly agentsNeeding: number;
  readonly agentsOpen: boolean;
  readonly selected: boolean;
  readonly timeZone: string | null;
  readonly onOpen: (chatId: string) => void;
  readonly onToggleAgents: (chatId: string) => void;
  readonly onDeleted: (chatId: string) => void;
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

function Trailing({
  entry,
  agent,
  timeZone,
  hovered,
}: {
  readonly entry: ChatEntry;
  readonly agent: boolean;
  readonly timeZone: string | null;
  readonly hovered: boolean;
}): ReactNode {
  const now = useMinute();
  return (
    <View className="items-end gap-1">
      <View className={cn('flex-row items-center gap-1', hovered && 'opacity-0')}>
        <Text variant="caption" tone="variant" className="tabular">
          {chatListTime(entry.at, now, timeZone)}
        </Text>
        {entry.pinned && !entry.archived ? <Icon name="pin" size={16} tone="variant" /> : null}
      </View>
      {agent ? null : <Unread entry={entry} />}
    </View>
  );
}

function HoverActions({
  entry,
  clearToggle,
}: {
  readonly entry: ChatEntry;
  readonly clearToggle: boolean;
}): ReactNode {
  const { leading, trailing } = rowSwipeOf(entry);
  return (
    <Animated.View
      entering={HOVER_BAR}
      className={cn('absolute top-0 flex-row items-center', clearToggle ? 'right-14' : 'right-2')}
    >
      {leading === undefined ? null : (
        <IconButton
          icon={leading.icon}
          label={`${leading.label} “${entry.title}”`}
          onPress={leading.onCommit}
        />
      )}
      <IconButton
        icon={trailing.icon}
        label={`${trailing.label} “${entry.title}”`}
        onPress={trailing.onCommit}
      />
    </Animated.View>
  );
}

function ChatMark({
  entry,
  status,
  size,
}: {
  readonly entry: ChatEntry;
  readonly status: Status | null;
  readonly size: 32 | 40;
}): ReactNode {
  const avatar = avatarOf(entry);
  return (
    <View className="relative">
      {avatar.kind === 'computer' ? (
        <ComputerMark computerId={avatar.computerId} size={size} />
      ) : (
        <SourceMark source={avatar.source} size={size} />
      )}
      {status === null ? null : <StatusDot tone={status.tone} label={status.label} />}
    </View>
  );
}

function AgentToggle({
  entry,
  count,
  running,
  needing,
  open,
  onToggle,
}: {
  readonly entry: ChatEntry;
  readonly count: number;
  readonly running: number;
  readonly needing: number;
  readonly open: boolean;
  readonly onToggle: (chatId: string) => void;
}): ReactNode {
  const noun = count === 1 ? 'agent' : 'agents';
  const state = [
    running > 0 ? `${String(running)} running` : '',
    needing > 0 ? `${String(needing)} need you` : '',
  ]
    .filter((part) => part !== '')
    .map((part) => `, ${part}`)
    .join('');
  return (
    <Interactive
      label={`${open ? 'Hide' : 'Show'} ${String(count)} ${noun} of “${entry.title}”${state}`}
      expanded={open}
      onPress={() => {
        onToggle(entry.id);
      }}
      className="min-h-touch-min min-w-touch-min flex-row items-center justify-center gap-0.5 rounded-sm px-2"
      layerClassName="rounded-sm"
    >
      <Text
        variant="caption"
        tone={needing > 0 ? 'warning' : running > 0 ? 'primary' : 'variant'}
        className="tabular"
      >
        {String(count)}
      </Text>
      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} tone="variant" />
    </Interactive>
  );
}

function Body({
  entry,
  line,
  agent,
}: {
  readonly entry: ChatEntry;
  readonly line: RowLine;
  readonly agent: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="min-w-0 flex-row items-center gap-1.5">
        {entry.nativeAdmission === 'standalone' && entry.runtime !== null ? (
          <View aria-hidden>
            <BrandGlyph brand={NATIVE_CHAT_BRANDS[entry.runtime]} size={16} />
          </View>
        ) : null}
        <Text
          variant={agent ? 'label' : 'body-strong'}
          numberOfLines={1}
          className={cn(
            entry.helperName === undefined ? 'min-w-0 shrink' : 'max-w-full shrink-0',
            entry.unread > 0 && 'font-sans-semibold',
          )}
        >
          {entry.helperName ?? entry.title}
        </Text>
        {entry.helperName === undefined ? null : (
          <Text variant="caption" tone="variant" numberOfLines={1} className="min-w-0 shrink">
            {`· ${entry.title}`}
          </Text>
        )}
      </View>
      <Line entry={entry} line={line} />
    </View>
  );
}

const OWNER_ONLY_ICONS: ReadonlySet<string> = new Set(['trash', 'gitBranch']);

function useRowMenu(
  entry: ChatEntry,
  onDeleted: ChatRowProps['onDeleted'],
): ReturnType<typeof menuOf> {
  const owner = useIsOwner();
  const store = useEntityStore();
  const readOnly = entry.runtime !== null && !owner;
  const storedMessages = (): readonly AssistantMessageRow[] =>
    store.get().tables.assistant_messages.rows.filter((row) => row.chat_id === entry.id);
  return menuOf(entry, { onDeleted, storedMessages }).filter(
    (item) => !readOnly || !OWNER_ONLY_ICONS.has(item.icon ?? ''),
  );
}

interface PressProps {
  readonly entry: ChatEntry;
  readonly agent: boolean;
  readonly selected: boolean;
  readonly timeZone: string | null;
  readonly hovered: boolean;
  readonly highlighted: boolean;
  readonly menu: ReturnType<typeof useContextMenu>;
  readonly openEntry: () => void;
}

function Bars({ selected, lit }: { readonly selected: boolean; readonly lit: boolean }): ReactNode {
  if (!selected && !lit) {
    return null;
  }
  return (
    <View
      className={cn(
        'absolute inset-y-2 left-0 w-0.75 rounded-r-sm',
        selected ? 'bg-primary' : 'bg-primary/40',
      )}
    />
  );
}

function rowHeight(agent: boolean, pointer: boolean): string {
  if (agent) return pointer ? 'h-10' : 'h-12';
  return pointer ? 'h-14' : 'h-16';
}

function RowPress({
  entry,
  agent,
  selected,
  timeZone,
  hovered,
  highlighted,
  menu,
  openEntry,
}: PressProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const line = useRowLine(entry, agent);
  const { leading, trailing } = rowSwipeOf(entry);
  return (
    <SwipeRow leading={leading} trailing={trailing} surface="bg">
      <Interactive
        label={a11yLabelOf(entry, line, agent)}
        selected={selected}
        onPress={openEntry}
        onLongPress={menu.onLongPress}
        onContextMenu={menu.onContextMenu}
        {...swipeAccessibility(leading, trailing)}
        className={cn(
          'flex-row items-center px-gutter',
          agent ? 'gap-2' : 'gap-3',
          rowHeight(agent, pointer),
          selected && 'bg-primary/12',
          highlighted && !selected && 'bg-on-surface/8',
        )}
      >
        <Bars selected={selected} lit={hovered || highlighted} />
        {agent ? (
          <AgentMark entry={entry} />
        ) : (
          <ChatMark entry={entry} status={statusOf(line)} size={pointer ? 32 : 40} />
        )}
        <Body entry={entry} line={line} agent={agent} />
        <Trailing entry={entry} agent={agent} timeZone={timeZone} hovered={hovered} />
      </Interactive>
    </SwipeRow>
  );
}

const isDelete = (item: MenuItem): boolean => item.destructive === true;

function Row(props: ChatRowProps): ReactNode {
  const { entry, agent, onDeleted, onOpen } = props;
  const motion = useMotion();
  const [hovered, setHovered] = useState(false);
  const openEntry = (): void => {
    onOpen(entry.id);
  };
  const items = useRowMenu(entry, onDeleted);
  const menu = useContextMenu(items, entry.title);
  const hoverShown = useIdiom() === 'pointer' && hovered;
  const keyboard = useKeyboardRow(entry.id);
  useDeleteKey(keyboard.highlighted, keyboard.nativeID, items.find(isDelete)?.onPress);
  return (
    <Animated.View
      nativeID={keyboard.nativeID}
      {...(motion.reduced ? {} : { layout: ROW_REORDER })}
      {...exiting(motion, ROW_EXIT)}
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      className={cn('-mx-gutter relative flex-row items-center', entry.archived && 'opacity-80')}
    >
      <View className={cn('min-w-0 flex-1', agent && 'ml-4 border-l-2 border-outline-variant')}>
        <RowPress
          {...props}
          hovered={hoverShown}
          highlighted={keyboard.highlighted}
          menu={menu}
          openEntry={openEntry}
        />
      </View>
      {props.agentCount > 0 ? (
        <AgentToggle
          entry={entry}
          count={props.agentCount}
          running={props.agentsRunning}
          needing={props.agentsNeeding}
          open={props.agentsOpen}
          onToggle={props.onToggleAgents}
        />
      ) : null}
      {hoverShown ? <HoverActions entry={entry} clearToggle={props.agentCount > 0} /> : null}
      {menu.host}
    </Animated.View>
  );
}

const ROW_KEYS = [
  'agent',
  'agentCount',
  'agentsRunning',
  'agentsNeeding',
  'agentsOpen',
  'selected',
  'timeZone',
  'onOpen',
  'onToggleAgents',
  'onDeleted',
] as const;

export const ChatRow = memo(
  Row,
  (left, right) =>
    sameEntry(left.entry, right.entry) && ROW_KEYS.every((key) => left[key] === right[key]),
);
