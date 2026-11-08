import { randomUUID } from 'expo-crypto';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  HOME_MAP_WALL_THICKNESS,
  type HomeMap,
  type HomeMapActor,
  type HomeMapFloor,
  type HomeMapOp,
} from '@smarteverything/domain';
import { Text } from '../../../../components/text';
import { useRooms } from '../../../../store/selectors';
import { ListSection } from './list-parts';
import { RoomItem } from './room-item';
import {
  checkedOps,
  newRoom,
  newWall,
  roomTitle,
  NOT_APPLIED_TEXT,
  type HubRoom,
  type ListEditContext,
} from './rooms-walls-model';
import { WallItem } from './wall-item';

export const ROOMS_WALLS_LABEL = 'Rooms, walls, doors and windows as a list';

export interface RoomsWallsListProps {
  readonly map: HomeMap;
  readonly floor: HomeMapFloor;
  readonly actor: HomeMapActor;
  readonly readOnly: boolean;
  readonly send: (ops: readonly HomeMapOp[]) => void;
}

const newId = (): string => randomUUID();

function useListContext(props: RoomsWallsListProps): {
  readonly context: ListEditContext;
  readonly notice: string | null;
} {
  const [notice, setNotice] = useState<string | null>(null);
  const context: ListEditContext = {
    floor: props.floor,
    readOnly: props.readOnly,
    apply: (ops): void => {
      const checked = checkedOps(props.map, ops, props.actor);
      if (checked === null) {
        setNotice(NOT_APPLIED_TEXT);
        return;
      }
      setNotice(null);
      props.send(checked);
    },
    notify: setNotice,
  };
  return { context, notice };
}

function Rooms({
  context,
  hubRooms,
  openId,
  onOpen,
}: {
  readonly context: ListEditContext;
  readonly hubRooms: readonly HubRoom[];
  readonly openId: string | null;
  readonly onOpen: (id: string | null) => void;
}): ReactNode {
  const { rooms } = context.floor;
  return (
    <ListSection
      title="Rooms"
      icon="square"
      count={rooms.length}
      addLabel="Add room"
      disabled={context.readOnly}
      onAdd={(): void => {
        const made = newRoom(context.floor, newId);
        context.apply([made.op]);
        onOpen(made.id);
      }}
    >
      {rooms.map((room, index) => (
        <RoomItem
          key={room.id}
          context={context}
          room={room}
          title={roomTitle(room, hubRooms, index)}
          hubRooms={hubRooms}
          open={openId === room.id}
          onToggle={(): void => {
            onOpen(openId === room.id ? null : room.id);
          }}
        />
      ))}
    </ListSection>
  );
}

function Walls({
  context,
  openId,
  onOpen,
}: {
  readonly context: ListEditContext;
  readonly openId: string | null;
  readonly onOpen: (id: string | null) => void;
}): ReactNode {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const { walls } = context.floor;
  return (
    <ListSection
      title="Walls"
      icon="pencil"
      count={walls.length}
      addLabel="Add wall"
      disabled={context.readOnly}
      onAdd={(): void => {
        const made = newWall(context.floor, HOME_MAP_WALL_THICKNESS.interior, newId);
        context.apply([made.op]);
        onOpen(made.id);
      }}
    >
      {walls.map((wall, index) => (
        <WallItem
          key={wall.id}
          context={context}
          wall={wall}
          title={`Wall ${String(index + 1)}`}
          open={openId === wall.id}
          onToggle={(): void => {
            onOpen(openId === wall.id ? null : wall.id);
          }}
          openings={{ openingId, onOpening: setOpeningId }}
        />
      ))}
    </ListSection>
  );
}

export function RoomsWallsList(props: RoomsWallsListProps): ReactNode {
  const { context, notice } = useListContext(props);
  const hubRooms = useRooms();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <View accessibilityLabel={ROOMS_WALLS_LABEL} className="gap-4">
      {notice === null ? null : (
        <Text variant="footnote" tone="warning" accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}
      <Rooms context={context} hubRooms={hubRooms} openId={openId} onOpen={setOpenId} />
      <Walls context={context} openId={openId} onOpen={setOpenId} />
    </View>
  );
}
