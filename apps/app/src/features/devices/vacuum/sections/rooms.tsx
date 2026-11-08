import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { HomeMapActor, VacuumStaleRoomLink } from '@smarteverything/domain';
import { ProgressBar } from '../../../../components/charts';
import { EmptyState } from '../../../../components/empty-state';
import { Icon, type IconName } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { roomIconOf } from '../../../../components/room-icon';
import { useActiveProfile } from '../../../../store/people';
import type { Device } from '../../../../store/state';
import { roomColourOf, useRoomColours } from '../../../../components/house-map/plan/room-colours';
import { parseMapVersion } from '../data/map-feed';
import { useVacuumScene } from '../data/scene-query';
import { useUnifiedMap } from '../data/use-unified-map';
import { useVacuum } from '../data/use-vacuum';
import { renderColourSlot } from '../../../../components/house-map/render-scene';
import { readingOf, valueOrNull } from '../model/readings';
import type { ShownRoom } from '../model/room-names';
import { unifiedMaterialOf, type UnifiedMap } from '../model/unified-map';
import { RoomEditor, floorLabel, floorLine } from './room-floor';
import { useRoomEdits, useUnifiedRoomEdits, type Edits } from './room-edits';
import { RoomLinkPicker } from './room-link-picker';
import {
  RobotReach,
  RoomLinkField,
  RoomLinksUnread,
  RoomsLinkFooter,
  RoomsLinkNotice,
  StaleLinks,
} from './rooms-links';
import { useRoomLinking, type RoomLinking } from './use-room-linking';

const NO_ROOMS: readonly ShownRoom[] = [];

const NO_STALE: readonly VacuumStaleRoomLink[] = [];

const NO_MAP = 'none';

export interface RoomRow {
  readonly id: number;
  readonly name: string;
  readonly robotName: string;
  readonly homeIcon: IconName | null;
  readonly colour: number;
  readonly areaM2: number;
  readonly share: number;
  readonly floor: number;
  readonly floorLabel: string;
  readonly hidden: boolean;
  readonly label: string;
}

function rowLabel(room: ShownRoom, floor: string): string {
  const parts = [
    room.name,
    ...(room.robotName === room.name ? [] : [`${room.robotName} on the robot`]),
    `${String(Math.round(room.areaM2))} square metres`,
    floor,
    ...(room.hidden ? ['hidden on the map'] : []),
  ];
  return parts.join(', ');
}

export function roomRows(rooms: readonly ShownRoom[]): readonly RoomRow[] {
  const total = rooms.reduce((sum, room) => sum + room.areaM2, 0);
  return [...rooms]
    .sort((left, right) => left.id - right.id)
    .map((room) => {
      const floor = floorLine(room.floor);
      return {
        id: room.id,
        name: room.name,
        robotName: room.robotName,
        homeIcon: room.homeRoomId === null ? null : roomIconOf(room.name),
        colour: room.colour,
        areaM2: room.areaM2,
        share: total > 0 ? room.areaM2 / total : 0,
        floor: room.floor,
        floorLabel: floor,
        hidden: room.hidden,
        label: rowLabel(room, floor),
      };
    });
}

export function headingLine(row: RoomRow): string | null {
  const parts = [
    ...(row.floor === 0 ? [] : [row.floorLabel]),
    ...(row.hidden ? ['Hidden on the map'] : []),
    ...(row.robotName === row.name ? [] : [`${row.robotName} on the robot`]),
  ];
  return parts.length === 0 ? null : parts.join(' · ');
}

function RoomHeading({
  row,
  dot,
  open,
}: {
  readonly row: RoomRow;
  readonly dot: string | undefined;
  readonly open: boolean;
}): ReactNode {
  const dotStyle = { backgroundColor: dot };
  const line = headingLine(row);
  return (
    <View className="flex-row items-center gap-3">
      <View style={dotStyle} className="size-3.5 rounded-full border border-on-surface-variant" />
      {row.homeIcon === null ? null : (
        <View className="size-8 items-center justify-center rounded-md bg-surface-2">
          <Icon name={row.homeIcon} size={16} tone="variant" />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {row.name}
        </Text>
        {line === null ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {line}
          </Text>
        )}
      </View>
      <Text variant="label" tone="variant" className="tabular">
        {`${String(Math.round(row.areaM2))} m²`}
      </Text>
      <Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} tone="variant" />
    </View>
  );
}

function RoomRowView({
  row,
  dot,
  open,
  editor,
  link,
  onToggle,
}: {
  readonly row: RoomRow;
  readonly dot: string | undefined;
  readonly open: boolean;
  readonly editor: ReactNode;
  readonly link: ReactNode;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <View className="gap-3 rounded-lg bg-surface-1 p-4">
      <Interactive
        role="button"
        label={`Floor and map options, ${row.label}`}
        expanded={open}
        onPress={onToggle}
        className="min-h-touch-min justify-center gap-2"
        layerClassName="rounded-md"
      >
        <RoomHeading row={row} dot={dot} open={open} />
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <ProgressBar
              progress={row.share}
              colour="primary"
              label={`${row.name} share of the home`}
            />
          </View>
          <Text variant="caption" tone="variant" className="tabular">
            {`${String(Math.round(row.share * 100))}% of the home`}
          </Text>
        </View>
      </Interactive>
      {link}
      {open ? editor : null}
    </View>
  );
}

interface RoomsOf {
  readonly rooms: readonly ShownRoom[];
  readonly online: boolean;
  readonly mapVersion: string;
}

function useRoomsOf(device: Device): RoomsOf {
  const { snapshot } = useVacuum(device);
  const version = valueOrNull(readingOf(() => parseMapVersion(snapshot.mapVersionText)));
  const scene = useVacuumScene(device.id, version).scene;
  return {
    rooms: scene?.rooms ?? NO_ROOMS,
    online: snapshot.online,
    mapVersion: version?.version ?? NO_MAP,
  };
}

function LinkSlot({
  linking,
  roomId,
}: {
  readonly linking: RoomLinking;
  readonly roomId: number;
}): ReactNode {
  const { links } = linking;
  const link = links?.rooms.find((room) => room.mapRoomId === roomId);
  if (links === null || link === undefined) {
    return null;
  }
  return (
    <RoomLinkField
      link={link}
      hasHomeRooms={links.homeRooms.length > 0}
      disabled={linking.busyRoom !== null}
      onPress={() => {
        linking.open(roomId);
      }}
    />
  );
}

function editorOf({
  row,
  unified,
  online,
  edits,
}: {
  readonly row: RoomRow;
  readonly unified: UnifiedMap | null;
  readonly online: boolean;
  readonly edits: Edits;
}): ReactNode {
  return (
    <RoomEditor
      key={row.id}
      row={row}
      material={unified === null ? null : unifiedMaterialOf(unified, row.id, floorLabel)}
      disabled={!online || edits.busyRoom === row.id}
      onEdit={(edit) => {
        edits.send({ roomId: row.id, roomName: row.name, edit });
      }}
    />
  );
}

interface ListProps extends RoomsOf {
  readonly device: Device;
}

function RoomList({
  device,
  rooms,
  online,
  mapVersion,
  edits,
  unified,
}: ListProps & { readonly edits: Edits; readonly unified: UnifiedMap | null }): ReactNode {
  const [openId, setOpenId] = useState<number | null>(null);
  const linking = useRoomLinking(device.id, mapVersion);
  const colours = useRoomColours();
  return (
    <View className="gap-2">
      {linking.failure === null ? null : <RoomLinksUnread onRetry={linking.retry} />}
      {roomRows(rooms).map((row) => (
        <RoomRowView
          key={row.id}
          row={row}
          dot={roomColourOf(colours, renderColourSlot(row.colour))}
          open={openId === row.id}
          editor={editorOf({ row, unified, online, edits })}
          link={<LinkSlot linking={linking} roomId={row.id} />}
          onToggle={() => {
            setOpenId(openId === row.id ? null : row.id);
          }}
        />
      ))}
      <StaleLinks
        stale={linking.links?.stale ?? NO_STALE}
        busy={linking.busyRoom !== null}
        onRemove={linking.removeStale}
      />
      <RoomLinkPicker
        choices={linking.choices}
        hasHomeRooms={(linking.links?.homeRooms.length ?? 0) > 0}
        onChoose={linking.choose}
        onClose={linking.close}
      />
    </View>
  );
}

function RobotRoomList(props: ListProps): ReactNode {
  return <RoomList {...props} edits={useRoomEdits(props.device.id)} unified={null} />;
}

function MapRoomList({
  unified,
  actor,
  ...props
}: ListProps & { readonly unified: UnifiedMap; readonly actor: HomeMapActor }): ReactNode {
  const edits = useUnifiedRoomEdits(props.device.id, unified, actor);
  return <RoomList {...props} edits={edits} unified={unified} />;
}

function Rooms({
  device,
  shown,
  unified,
}: {
  readonly device: Device;
  readonly shown: RoomsOf;
  readonly unified: UnifiedMap | null;
}): ReactNode {
  const profile = useActiveProfile();
  if (unified === null || profile === null) {
    return <RobotRoomList device={device} {...shown} />;
  }
  return (
    <MapRoomList device={device} {...shown} unified={unified} actor={`profile:${profile.id}`} />
  );
}

export function VacuumRooms({ device }: { readonly device: Device }): ReactNode {
  const shown = useRoomsOf(device);
  const unified = useUnifiedMap(device.id, useVacuum(device).snapshot.mapVersionText);
  if (shown.rooms.length === 0) {
    return (
      <EmptyState
        compact
        icon="vacuum"
        title="No rooms yet"
        body="Run a mapping and the rooms of the home appear here."
      />
    );
  }
  return (
    <View className="gap-3">
      <RoomsLinkNotice deviceId={device.id} />
      <Rooms device={device} shown={shown} unified={unified} />
      <RoomsLinkFooter deviceId={device.id} />
      {unified === null ? null : <RobotReach floorName={unified.place.floor.name} />}
    </View>
  );
}
