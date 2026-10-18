import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { decimal } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { useComfortReadings, type ComfortMetric } from '../../climate';
import { familyIcon } from '../../device-visuals';
import { setRoomLights } from '../data/room-lights';
import {
  lightsToggleOf,
  sameRoom,
  type LightsToggle,
  type RoomMember,
  type RoomSummary,
} from '../model/rooms';
import { background } from '@smarteverything/logging';

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

function LightsButton({ toggle }: { readonly toggle: LightsToggle }): ReactNode {
  return (
    <View className="absolute right-1 top-1">
      <IconButton
        icon="bulb"
        label={toggle.label}
        variant={toggle.on ? 'tonal' : 'filled'}
        onPress={() => {
          background(setRoomLights(toggle), 'room_lights.set_failed');
        }}
      />
    </View>
  );
}

function Card({ room, dense }: RoomCardProps): ReactNode {
  const climate = useRoomClimate(room.id);
  const toggle = lightsToggleOf(room);
  return (
    <View className="relative h-full">
      <Interactive
        href={href.room(room.id)}
        label={`${room.name}, ${plural(room.devices, 'device')}`}
        className="h-full justify-between gap-1.5 rounded-md bg-surface-2 p-2.5"
        layerClassName="rounded-md"
      >
        <Text variant="callout" numberOfLines={2} className={toggle === null ? '' : 'pr-touch-min'}>
          {room.name}
        </Text>
        <Text variant="footnote" tone={room.offline > 0 ? 'warning' : 'variant'} numberOfLines={1}>
          {joinParts([
            plural(room.devices, 'device'),
            room.offline > 0 && `${String(room.offline)} offline`,
            climate,
          ])}
        </Text>
        {dense ? null : (
          <View className="flex-row items-center justify-between gap-2">
            <Members room={room} />
            {room.on === 0 || toggle !== null ? null : (
              <Badge label={`${String(room.on)} on`} tone="primary" />
            )}
          </View>
        )}
      </Interactive>
      {toggle === null ? null : <LightsButton toggle={toggle} />}
    </View>
  );
}

export const RoomCard = memo(
  Card,
  (left, right) => left.dense === right.dense && sameRoom(left.room, right.room),
);
