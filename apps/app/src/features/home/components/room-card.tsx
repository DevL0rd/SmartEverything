import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { decimal } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { useComfortReadings, type ComfortMetric } from '../../climate';
import { familyIcon } from '../../device-visuals';
import { sameRoom, type RoomMember, type RoomSummary } from '../model/rooms';

const ROOM_METRICS: readonly ComfortMetric[] = ['temperature', 'humidity'];

export function useRoomClimate(roomId: string): string {
  const readings = useComfortReadings(ROOM_METRICS, roomId).filter((reading) => !reading.stale);
  return joinParts(
    readings.map((reading) =>
      reading.metric === 'temperature'
        ? `${decimal(reading.amount, 0)}°`
        : `${decimal(reading.amount, 0)} %`,
    ),
  );
}

function Member({ member }: { readonly member: RoomMember }): ReactNode {
  return (
    <View
      className={cn(
        'size-7 items-center justify-center rounded-full',
        member.on ? 'bg-primary-container' : 'bg-surface-3',
      )}
    >
      <Icon name={familyIcon(member.family)} size={16} tone={member.on ? 'primary' : 'faint'} />
    </View>
  );
}

function Members({ room }: { readonly room: RoomSummary }): ReactNode {
  const more = room.devices - room.members.length;
  return (
    <View className="flex-row items-center gap-1">
      {room.members.map((member) => (
        <Member key={member.id} member={member} />
      ))}
      {more > 0 ? (
        <Text variant="caption" tone="variant" className="pl-1">
          {`+${String(more)}`}
        </Text>
      ) : null}
    </View>
  );
}

interface RoomCardProps {
  readonly room: RoomSummary;
  readonly dense: boolean;
}

function Card({ room, dense }: RoomCardProps): ReactNode {
  const climate = useRoomClimate(room.id);
  return (
    <Interactive
      href={href.room(room.id)}
      label={`${room.name}, ${plural(room.devices, 'device')}`}
      className="h-full justify-between gap-1.5 rounded-md bg-surface-2 p-3"
      layerClassName="rounded-md"
    >
      <View className="flex-row items-center gap-2">
        <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
          {room.name}
        </Text>
        {dense && climate !== '' ? (
          <Text variant="footnote" tone="variant" className="tabular" numberOfLines={1}>
            {climate}
          </Text>
        ) : null}
      </View>
      {dense ? null : (
        <View className="gap-0.5">
          {climate === '' ? null : (
            <Text variant="title-2" numberOfLines={1}>
              {climate}
            </Text>
          )}
          <Text
            variant="footnote"
            tone={room.offline > 0 ? 'warning' : 'variant'}
            numberOfLines={1}
          >
            {room.offline === 0
              ? plural(room.devices, 'device')
              : `${plural(room.devices, 'device')} · ${String(room.offline)} offline`}
          </Text>
        </View>
      )}
      <View className="flex-row items-center justify-between gap-2">
        <Members room={room} />
        {room.on === 0 ? null : <Badge label={`${String(room.on)} on`} tone="primary" />}
      </View>
    </Interactive>
  );
}

export const RoomCard = memo(
  Card,
  (left, right) => left.dense === right.dense && sameRoom(left.room, right.room),
);
