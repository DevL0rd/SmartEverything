import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  homeMapDistance,
  homeMapPolygonArea,
  type HomeMapRoom,
  type HomeMapVec,
} from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { ListRow } from '../../../../components/list-row';
import { NumberStepper } from '../../../../components/number-stepper';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import { useDocumentKeys } from '../manipulate/document-keys';
import { ShapeThumb } from '../list-editor/list-parts';
import { roomTitle, type HubRoom } from '../list-editor/rooms-walls-model';
import type { RoomsEdit } from './rooms-edit';
import { ringSize, type SizeAxis } from './rooms-edit-geometry';
import {
  REFUSAL_TEXT,
  linkChoices,
  mergeCandidates,
  namesItself,
  type EditFloor,
} from './rooms-edit-model';

export const SPLIT_HINT = 'Tap two points on either side of the room where the new wall goes.';

export const MERGE_HINT = 'Tap a highlighted room next to it, or choose one below.';

function titleOf(floor: EditFloor, room: HomeMapRoom, hubRooms: readonly HubRoom[]): string {
  return roomTitle(room, hubRooms, floor.rooms.indexOf(room));
}

function Refusal({ edit }: { readonly edit: RoomsEdit }): ReactNode {
  if (edit.refusal === null) return null;
  return (
    <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
      {REFUSAL_TEXT[edit.refusal]}
    </Text>
  );
}

function Modes({ edit }: { readonly edit: RoomsEdit }): ReactNode {
  const { floor, room } = edit;
  const joinable = floor !== null && room !== null && mergeCandidates(floor, room.id).length > 0;
  return (
    <View className="flex-row gap-2">
      <Button
        label="Split room"
        icon="ruler"
        variant="outlined"
        grow
        disabled={edit.readOnly}
        hint="Draw a line to cut this room in two"
        onPress={(): void => {
          edit.start('split');
        }}
      />
      <Button
        label="Merge"
        icon="square"
        variant="outlined"
        grow
        disabled={edit.readOnly || !joinable}
        hint="Join this room with a room next to it"
        onPress={(): void => {
          edit.start('merge');
        }}
      />
    </View>
  );
}

const STEP_M = 0.01;

const FAR_M = Number.MAX_SAFE_INTEGER;

const toStep = (metres: number): number => Math.round(metres / STEP_M) * STEP_M;

function Metres({
  label,
  value,
  min,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly disabled: boolean;
  readonly onChange: (metres: number) => void;
}): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="caption" tone="variant">
        {label}
      </Text>
      <NumberStepper
        label={label}
        unit="m"
        step={STEP_M}
        value={toStep(value)}
        min={min}
        max={FAR_M}
        disabled={disabled}
        onChange={onChange}
      />
    </View>
  );
}

const SIZE_FIELDS: readonly { readonly axis: SizeAxis; readonly label: string }[] = [
  { axis: 'x', label: 'Width' },
  { axis: 'y', label: 'Depth' },
];

function SizeCard({
  edit,
  room,
}: {
  readonly edit: RoomsEdit;
  readonly room: HomeMapRoom;
}): ReactNode {
  const area = homeMapPolygonArea(room.polygon);
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-3">
      <View className="flex-row flex-wrap gap-3">
        {SIZE_FIELDS.map((field) => (
          <Metres
            key={field.axis}
            label={field.label}
            value={ringSize(room.polygon.outer, field.axis)}
            min={STEP_M}
            disabled={edit.readOnly}
            onChange={(metres): void => {
              edit.resize(field.axis, metres);
            }}
          />
        ))}
      </View>
      <View
        className="gap-1"
        accessible
        accessibilityLabel={`Area ${area.toFixed(1)} square metres`}
      >
        <Text variant="caption" tone="variant">
          Area
        </Text>
        <Text variant="body-strong" className="tabular">{`${area.toFixed(1)} m²`}</Text>
      </View>
    </View>
  );
}

export const REMOVE_HINT = 'The Delete key does the same on a keyboard';

export const MIN_CORNERS_HINT = 'A room needs at least three corners';

export function cornerTitle(index: number, count: number): string {
  return `Corner ${String(index + 1)} of ${String(count)}`;
}

function CornerFields({
  edit,
  index,
  point,
}: {
  readonly edit: RoomsEdit;
  readonly index: number;
  readonly point: HomeMapVec;
}): ReactNode {
  const move = (x: number, y: number): void => {
    if (homeMapDistance(point, { x, y }) > 0) edit.setCorner(index, { x, y });
  };
  return (
    <View className="flex-row flex-wrap gap-3">
      <Metres
        label="X"
        value={point.x}
        min={-FAR_M}
        disabled={edit.readOnly}
        onChange={(x): void => {
          move(x, point.y);
        }}
      />
      <Metres
        label="Y"
        value={point.y}
        min={-FAR_M}
        disabled={edit.readOnly}
        onChange={(y): void => {
          move(point.x, y);
        }}
      />
    </View>
  );
}

function CornerCard({
  edit,
  room,
  index,
}: {
  readonly edit: RoomsEdit;
  readonly room: HomeMapRoom;
  readonly index: number;
}): ReactNode {
  const ring = room.polygon.outer;
  const point = ring[index];
  const removable = !edit.readOnly && ring.length > 3;
  useDocumentKeys(removable, (press) => {
    if (press.key !== 'Delete' && press.key !== 'Backspace') return false;
    edit.removeCorner();
    return true;
  });
  if (point === undefined) return null;
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-3">
      <Text variant="body-strong" accessibilityLiveRegion="polite">
        {cornerTitle(index, ring.length)}
      </Text>
      <CornerFields edit={edit} index={index} point={point} />
      <Button
        label="Remove corner"
        icon="trash"
        variant="destructive"
        disabled={!removable}
        hint={ring.length > 3 ? REMOVE_HINT : MIN_CORNERS_HINT}
        onPress={edit.removeCorner}
      />
    </View>
  );
}

function SplitRow({ edit }: { readonly edit: RoomsEdit }): ReactNode {
  const line = edit.mode.kind === 'split' ? edit.mode.line : null;
  const ready = line !== null && homeMapDistance(line.from, line.to) > 0 && !edit.readOnly;
  return (
    <View className="gap-2 rounded-md bg-surface-2 p-3">
      <Text variant="body-strong" accessibilityLiveRegion="polite">
        Split this room
      </Text>
      <Text variant="footnote" tone="variant">
        {SPLIT_HINT}
      </Text>
      <Refusal edit={edit} />
      <View className="flex-row gap-2">
        <Button label="Cancel" variant="outlined" grow onPress={edit.cancel} />
        <Button label="Split room" icon="check" grow disabled={!ready} onPress={edit.cut} />
      </View>
    </View>
  );
}

function MergeRow({
  edit,
  hubRooms,
}: {
  readonly edit: RoomsEdit;
  readonly hubRooms: readonly HubRoom[];
}): ReactNode {
  const { floor, room } = edit;
  if (floor === null || room === null) return null;
  return (
    <View className="gap-2 rounded-md bg-surface-2 p-3">
      <Text variant="body-strong" accessibilityLiveRegion="polite">
        Merge with a room next to it
      </Text>
      <Text variant="footnote" tone="variant">
        {MERGE_HINT}
      </Text>
      {mergeCandidates(floor, room.id).map((other) => (
        <ListRow
          key={other.id}
          title={titleOf(floor, other, hubRooms)}
          leading={<ShapeThumb points={other.polygon.outer} closed />}
          disabled={edit.readOnly}
          onPress={(): void => {
            edit.merge(other.id);
          }}
        />
      ))}
      <Refusal edit={edit} />
      <Button label="Cancel" variant="outlined" onPress={edit.cancel} />
    </View>
  );
}

function LinkList({
  edit,
  room,
  hubRooms,
}: {
  readonly edit: RoomsEdit;
  readonly room: HomeMapRoom;
  readonly hubRooms: readonly HubRoom[];
}): ReactNode {
  const floor = edit.floor;
  if (floor === null) return null;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Home room" className="gap-1">
      <Text variant="body-strong">Home room</Text>
      <ListRow
        title="Not linked"
        checked={room.homeRoomId === null}
        disabled={edit.readOnly}
        onPress={(): void => {
          edit.link(null);
        }}
      />
      {linkChoices(floor, room, hubRooms).map((hub) => (
        <ListRow
          key={hub.id}
          icon="home"
          title={hub.name}
          checked={room.homeRoomId === hub.id}
          disabled={edit.readOnly}
          onPress={(): void => {
            edit.link(hub.id);
          }}
        />
      ))}
      {edit.linkNote === null ? null : (
        <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {edit.linkNote}
        </Text>
      )}
    </View>
  );
}

function NameField({
  edit,
  room,
}: {
  readonly edit: RoomsEdit;
  readonly room: HomeMapRoom;
}): ReactNode {
  const [draft, setDraft] = useState(room.name ?? '');
  const commit = (): void => {
    edit.rename(draft);
  };
  return (
    <TextField
      label="Room name"
      value={draft}
      placeholder="For example Pantry"
      helper="Only rooms that are not linked to a home room have their own name."
      disabled={edit.readOnly}
      onChange={setDraft}
      onBlur={commit}
      onSubmit={commit}
    />
  );
}

export function RoomsEditPanel({
  edit,
  hubRooms,
}: {
  readonly edit: RoomsEdit;
  readonly hubRooms: readonly HubRoom[];
}): ReactNode {
  const { room, mode, corner } = edit;
  if (room === null) return null;
  if (mode.kind === 'split') return <SplitRow edit={edit} />;
  if (mode.kind === 'merge') return <MergeRow edit={edit} hubRooms={hubRooms} />;
  return (
    <View className="gap-3">
      {corner === null ? (
        <SizeCard edit={edit} room={room} />
      ) : (
        <CornerCard key={`${room.id}:${String(corner)}`} edit={edit} room={room} index={corner} />
      )}
      <Modes edit={edit} />
      <LinkList edit={edit} room={room} hubRooms={hubRooms} />
      {namesItself(room) ? (
        <NameField key={`${room.id}:${room.name ?? ''}`} edit={edit} room={room} />
      ) : null}
    </View>
  );
}
