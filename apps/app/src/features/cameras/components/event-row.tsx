import type { ReactNode } from 'react';
import { View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import type { MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { clock } from '../../../format/time';
import { joinParts } from '../../../format/text';
import { eventLook } from '../../activity';
import { recordingTarget, type EventEntry } from '../logic/event-entries';
import { EventThumb } from './event-thumb';

export interface EventRowProps {
  readonly entry: EventEntry;
  readonly cameraName: string | null;
  readonly thumb: string | null;
  readonly timeZone: string;
  readonly expanded?: boolean;
  readonly onToggle?: () => void;
  readonly onDelete: (() => void) | null;
}

export function subtitleOf(entry: EventEntry, timeZone: string): string {
  if (entry.count > 1) {
    return joinParts([
      `${String(entry.count)} times`,
      `${clock(entry.oldest, timeZone)}–${clock(entry.at, timeZone)}`,
    ]);
  }
  return joinParts([
    clock(entry.at, timeZone),
    entry.recordingIds.length === 0 ? 'Nothing saved' : null,
  ]);
}

function rowSubtitle(entry: EventEntry, cameraName: string | null, timeZone: string): string {
  const when = subtitleOf(entry, timeZone);
  return cameraName === null ? when : joinParts([eventLook(entry.kind, entry.details).label, when]);
}

function DeleteAction(): ReactNode {
  return (
    <View className="w-24 items-center justify-center bg-critical">
      <Icon name="trash" size={24} tone="onPrimary" />
      <Text variant="caption" tone="onPrimary">
        Delete
      </Text>
    </View>
  );
}

function menuOf(onDelete: (() => void) | null): readonly MenuItem[] {
  const items: MenuItem[] = [];
  if (onDelete !== null) {
    items.push({ label: 'Delete', icon: 'trash', destructive: true, onPress: onDelete });
  }
  return items;
}

function Trailing({
  burst,
  expanded,
  onDelete,
}: {
  readonly burst: boolean;
  readonly expanded: boolean;
  readonly onDelete: (() => void) | null;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  if (burst) {
    return <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={20} tone="faint" />;
  }
  return pointer && onDelete !== null ? (
    <IconButton icon="trash" label="Delete" onPress={onDelete} />
  ) : null;
}

export function EventRow(props: EventRowProps): ReactNode {
  const { entry, cameraName, onDelete } = props;
  const pointer = useIdiom() === 'pointer';
  const look = eventLook(entry.kind, entry.details);
  const target = recordingTarget(entry);
  const burst = entry.count > 1 && props.onToggle !== undefined;
  const link = burst || target === null ? undefined : href.clip(entry.deviceId, target);
  const row = (
    <ListRow
      title={cameraName ?? look.label}
      subtitle={rowSubtitle(entry, cameraName, props.timeZone)}
      leading={<EventThumb uri={props.thumb} kind={entry.kind} clipMs={entry.clipMs} />}
      {...(link === undefined ? {} : { href: link })}
      {...(burst ? { onPress: props.onToggle } : {})}
      contextMenu={menuOf(onDelete)}
      trailing={<Trailing burst={burst} expanded={props.expanded === true} onDelete={onDelete} />}
    />
  );
  if (pointer || onDelete === null || burst) {
    return row;
  }
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={64}
      renderRightActions={() => <DeleteAction />}
      onSwipeableOpen={onDelete}
    >
      <View className="bg-surface-1">{row}</View>
    </ReanimatedSwipeable>
  );
}
