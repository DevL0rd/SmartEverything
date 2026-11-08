import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { homeMapRingArea, type HomeMapRoom, type HomeMapVec } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { ListRow } from '../../../../components/list-row';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import { CmField, ListItem, PointFields, ShapeThumb, metres } from './list-parts';
import { RoomSplitMerge } from './room-split-merge';
import {
  addCornerOp,
  applyOne,
  cornerOp,
  linkableRooms,
  removeCornerOp,
  roomLinkNote,
  roomLinkOp,
  roomNameOp,
  roomRect,
  roomRectOp,
  type HubRoom,
  type ListEditContext,
  type RoomRect,
} from './rooms-walls-model';

const MIN_SIDE_M = 0.01;

function shapeText(room: HomeMapRoom): string {
  const ring = room.polygon.outer;
  const rect = roomRect(ring);
  const area = `${homeMapRingArea(ring).toFixed(1)} m²`;
  if (rect === null) return `${String(ring.length)} corners · ${area}`;
  return `${rect.width.toFixed(2)} × ${rect.length.toFixed(2)} m · ${area}`;
}

export function roomSubtitle(room: HomeMapRoom, hubRooms: readonly HubRoom[]): string {
  const note = roomLinkNote(room, hubRooms);
  return note === null ? shapeText(room) : `${note} · ${shapeText(room)}`;
}

function RectFields({
  context,
  room,
  rect,
}: {
  readonly context: ListEditContext;
  readonly room: HomeMapRoom;
  readonly rect: RoomRect;
}): ReactNode {
  const resize = (next: RoomRect): void => {
    applyOne(context, roomRectOp(context.floor.id, room, next));
  };
  return (
    <View className="gap-3">
      <CmField
        label="Width"
        value={rect.width}
        min={MIN_SIDE_M}
        disabled={context.readOnly}
        onChange={(width): void => {
          resize({ ...rect, width });
        }}
      />
      <CmField
        label="Length"
        value={rect.length}
        min={MIN_SIDE_M}
        disabled={context.readOnly}
        onChange={(length): void => {
          resize({ ...rect, length });
        }}
      />
      <PointFields
        label="Top left corner"
        point={{ x: rect.x, y: rect.y }}
        disabled={context.readOnly}
        onChange={(point: HomeMapVec): void => {
          resize({ ...rect, x: point.x, y: point.y });
        }}
      />
    </View>
  );
}

function CornerRow({
  context,
  room,
  index,
}: {
  readonly context: ListEditContext;
  readonly room: HomeMapRoom;
  readonly index: number;
}): ReactNode {
  const corner = room.polygon.outer[index];
  if (corner === undefined) return null;
  const label = `Corner ${String(index + 1)}`;
  return (
    <View className="gap-1 rounded-md bg-surface-1 p-2">
      <PointFields
        label={label}
        point={corner}
        disabled={context.readOnly}
        onChange={(point): void => {
          applyOne(context, cornerOp(context.floor.id, room, index, point));
        }}
      />
      <View className="flex-row justify-end gap-1">
        <IconButton
          icon="plus"
          label={`Add a corner after ${label}`}
          disabled={context.readOnly}
          onPress={(): void => {
            applyOne(context, addCornerOp(context.floor.id, room, index));
          }}
        />
        <IconButton
          icon="minus"
          label={`Remove ${label}`}
          disabled={context.readOnly || room.polygon.outer.length <= 3}
          onPress={(): void => {
            applyOne(context, removeCornerOp(context.floor.id, room, index));
          }}
        />
      </View>
    </View>
  );
}

function CornerTable({
  context,
  room,
}: {
  readonly context: ListEditContext;
  readonly room: HomeMapRoom;
}): ReactNode {
  return (
    <View className="gap-2">
      {room.polygon.outer.map((corner, index) => (
        <CornerRow
          key={`${String(index)}:${String(corner.x)}:${String(corner.y)}`}
          context={context}
          room={room}
          index={index}
        />
      ))}
    </View>
  );
}

function LinkList({
  context,
  room,
  hubRooms,
}: {
  readonly context: ListEditContext;
  readonly room: HomeMapRoom;
  readonly hubRooms: readonly HubRoom[];
}): ReactNode {
  const choose = (homeRoomId: string | null): void => {
    const op = roomLinkOp(context.floor.id, room, homeRoomId);
    if (op !== null) context.apply([op]);
  };
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Home room" className="gap-1">
      <Text variant="body-strong">Home room</Text>
      <ListRow
        title="Not linked"
        checked={room.homeRoomId === null}
        disabled={context.readOnly}
        onPress={(): void => {
          choose(null);
        }}
      />
      {linkableRooms(context.floor, room.id, hubRooms).map((hub) => (
        <ListRow
          key={hub.id}
          icon="home"
          title={hub.name}
          checked={room.homeRoomId === hub.id}
          disabled={context.readOnly}
          onPress={(): void => {
            choose(hub.id);
          }}
        />
      ))}
    </View>
  );
}

function NameField({
  context,
  room,
}: {
  readonly context: ListEditContext;
  readonly room: HomeMapRoom;
}): ReactNode {
  const [draft, setDraft] = useState(room.name ?? '');
  const commit = (): void => {
    const op = roomNameOp(context.floor.id, room, draft);
    if (op !== null) context.apply([op]);
  };
  return (
    <TextField
      label="Room name"
      value={draft}
      disabled={context.readOnly}
      onChange={setDraft}
      onBlur={commit}
      onSubmit={commit}
    />
  );
}

function Size({
  context,
  room,
}: {
  readonly context: ListEditContext;
  readonly room: HomeMapRoom;
}): ReactNode {
  const rect = roomRect(room.polygon.outer);
  return rect === null ? (
    <CornerTable context={context} room={room} />
  ) : (
    <>
      <RectFields context={context} room={room} rect={rect} />
      <Button
        label="Add a corner for another shape"
        icon="plus"
        variant="outlined"
        disabled={context.readOnly}
        onPress={(): void => {
          applyOne(context, addCornerOp(context.floor.id, room, 0));
        }}
      />
    </>
  );
}

export function RoomItem({
  context,
  room,
  title,
  hubRooms,
  open,
  onToggle,
}: {
  readonly context: ListEditContext;
  readonly room: HomeMapRoom;
  readonly title: string;
  readonly hubRooms: readonly HubRoom[];
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <ListItem
      title={title}
      subtitle={roomSubtitle(room, hubRooms)}
      thumb={<ShapeThumb points={room.polygon.outer} closed />}
      open={open}
      onToggle={onToggle}
    >
      <LinkList context={context} room={room} hubRooms={hubRooms} />
      {room.homeRoomId === null ? (
        <NameField key={room.name ?? ''} context={context} room={room} />
      ) : null}
      <Size context={context} room={room} />
      <Text variant="caption" tone="variant">
        {`Perimeter ${metres(perimeter(room.polygon.outer))}`}
      </Text>
      <RoomSplitMerge context={context} room={room} hubRooms={hubRooms} />
      <Button
        label="Delete this room"
        icon="trash"
        variant="destructive"
        disabled={context.readOnly}
        onPress={(): void => {
          context.apply([{ op: 'remove', kind: 'room', floorId: context.floor.id, id: room.id }]);
        }}
      />
    </ListItem>
  );
}

function perimeter(ring: readonly HomeMapVec[]): number {
  return ring.reduce((total, point, index) => {
    const next = ring[(index + 1) % ring.length] ?? point;
    return total + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
}
