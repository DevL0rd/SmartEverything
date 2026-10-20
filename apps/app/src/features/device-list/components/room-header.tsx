import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { usePinContextMenu } from '../../../app-shell/pin-context-menu';
import { Badge } from '../../../components/badge';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { joinParts, plural } from '../../../format/text';
import { useRoomSummary, type RoomSummary } from '../../home';
import { NO_ROOM } from '../model/device-filter';
import { roomIconOf, roomStatusLine } from '../model/room-band';

export interface RoomHeaderEntry {
  readonly key: string;
  readonly title: string;
  readonly count: number;
  readonly status: boolean;
  readonly alone: boolean;
}

function Well({ icon, lit }: { readonly icon: IconName; readonly lit: boolean }): ReactNode {
  return (
    <View
      className={cn(
        'size-12 items-center justify-center rounded-lg',
        lit ? 'bg-primary-container' : 'bg-surface-3',
      )}
    >
      <Icon name={icon} size={24} tone={lit ? 'primary' : 'variant'} />
    </View>
  );
}

function OnBar({ on, total }: { readonly on: number; readonly total: number }): ReactNode {
  return (
    <View aria-hidden className="h-1 flex-row gap-0.5">
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          className={cn('h-full flex-1 rounded-full', index < on ? 'bg-primary' : 'bg-surface-3')}
        />
      ))}
    </View>
  );
}

function Details({
  entry,
  summary,
}: {
  readonly entry: RoomHeaderEntry;
  readonly summary: RoomSummary | null;
}): ReactNode {
  const line = joinParts([
    plural(entry.count, 'device'),
    summary !== null && roomStatusLine(summary),
  ]);
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text variant="title-3" numberOfLines={1} accessibilityRole="header">
        {entry.title}
      </Text>
      <Text
        variant="footnote"
        tone={summary !== null && summary.offline > 0 ? 'warning' : 'variant'}
        numberOfLines={1}
      >
        {line}
      </Text>
      {summary === null || summary.devices === 0 ? null : (
        <OnBar on={summary.on} total={summary.devices} />
      )}
    </View>
  );
}

function Body({ entry }: { readonly entry: RoomHeaderEntry }): ReactNode {
  const summary = useRoomSummary(entry.status ? entry.key : '');
  const lights = summary?.lightsOn ?? 0;
  return (
    <View className="flex-row items-center gap-3 p-3">
      <Well icon={roomIconOf(entry.title)} lit={lights > 0} />
      <Details entry={entry} summary={summary} />
      {lights > 0 ? (
        <Badge label={`${plural(lights, 'light')} on`} tone="primary" icon="bulb" />
      ) : null}
      {entry.key === NO_ROOM ? null : <Icon name="chevronRight" size={20} tone="faint" />}
    </View>
  );
}

const FRAME = 'rounded-t-xl border border-b-0 border-outline-variant bg-surface-1';

function Header({ entry }: { readonly entry: RoomHeaderEntry }): ReactNode {
  const linked = entry.key !== NO_ROOM;
  const menu = usePinContextMenu({ kind: 'room', roomId: entry.key }, entry.title);
  const frame = cn(FRAME, entry.alone && 'rounded-b-xl border-b');
  return (
    <View className="pt-6">
      {linked ? (
        <Interactive
          href={href.room(entry.key)}
          onLongPress={menu.onLongPress}
          onContextMenu={menu.onContextMenu}
          label={`${entry.title}, ${plural(entry.count, 'device')}`}
          className={frame}
          layerClassName="rounded-t-xl"
        >
          <Body entry={entry} />
        </Interactive>
      ) : (
        <View className={frame}>
          <Body entry={entry} />
        </View>
      )}
      {menu.host}
    </View>
  );
}

export const RoomHeader = memo(Header, (left, right) => {
  const [a, b] = [left.entry, right.entry];
  return (
    a.key === b.key &&
    a.title === b.title &&
    a.count === b.count &&
    a.status === b.status &&
    a.alone === b.alone
  );
});
