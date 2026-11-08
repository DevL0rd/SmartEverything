import { randomUUID } from 'expo-crypto';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { HomeMapRoom, HomeMapVec } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { ListRow } from '../../../../components/list-row';
import { Text } from '../../../../components/text';
import {
  REFUSAL_TEXT,
  mergeCandidates,
  mergeRooms,
  splitRoom,
  type EditStep,
} from '../tools/rooms-edit-model';
import { PointFields, ShapeThumb } from './list-parts';
import { roomTitle, type HubRoom, type ListEditContext } from './rooms-walls-model';

interface CutLine {
  readonly from: HomeMapVec;
  readonly to: HomeMapVec;
}

const newId = (): string => randomUUID();

export function middleCut(ring: readonly HomeMapVec[]): CutLine {
  const xs = ring.map((point) => point.x);
  const ys = ring.map((point) => point.y);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  return { from: { x, y: Math.min(...ys) }, to: { x, y: Math.max(...ys) } };
}

function run(context: ListEditContext, step: EditStep): boolean {
  if (step.kind === 'refused') {
    context.notify(REFUSAL_TEXT[step.reason]);
    return false;
  }
  context.apply(step.ops);
  return true;
}

export function SplitFields({
  context,
  room,
  onDone,
}: {
  readonly context: ListEditContext;
  readonly room: HomeMapRoom;
  readonly onDone: () => void;
}): ReactNode {
  const [line, setLine] = useState<CutLine>(() => middleCut(room.polygon.outer));
  return (
    <View className="gap-2 rounded-md bg-surface-1 p-2">
      <Text variant="footnote" tone="variant">
        The cut runs along the line through these two points, right across the room.
      </Text>
      <PointFields
        label="Cut start"
        point={line.from}
        disabled={context.readOnly}
        onChange={(from): void => {
          setLine({ ...line, from });
        }}
      />
      <PointFields
        label="Cut end"
        point={line.to}
        disabled={context.readOnly}
        onChange={(to): void => {
          setLine({ ...line, to });
        }}
      />
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Split along this line"
          icon="ruler"
          disabled={context.readOnly}
          onPress={(): void => {
            if (run(context, splitRoom(context.floor, room.id, line, newId))) onDone();
          }}
        />
        <Button label="Cancel" variant="outlined" onPress={onDone} />
      </View>
    </View>
  );
}

function MergeList({
  context,
  room,
  hubRooms,
}: {
  readonly context: ListEditContext;
  readonly room: HomeMapRoom;
  readonly hubRooms: readonly HubRoom[];
}): ReactNode {
  const candidates = mergeCandidates(context.floor, room.id);
  if (candidates.length === 0) return null;
  return (
    <View accessibilityLabel="Merge with" className="gap-1">
      <Text variant="body-strong">Merge with</Text>
      {candidates.map((other) => (
        <ListRow
          key={other.id}
          title={roomTitle(other, hubRooms, context.floor.rooms.indexOf(other))}
          leading={<ShapeThumb points={other.polygon.outer} closed />}
          disabled={context.readOnly}
          onPress={(): void => {
            run(context, mergeRooms(context.floor, room.id, other.id));
          }}
        />
      ))}
    </View>
  );
}

export function RoomSplitMerge({
  context,
  room,
  hubRooms,
}: {
  readonly context: ListEditContext;
  readonly room: HomeMapRoom;
  readonly hubRooms: readonly HubRoom[];
}): ReactNode {
  const [splitting, setSplitting] = useState(false);
  return (
    <View className="gap-3">
      <MergeList context={context} room={room} hubRooms={hubRooms} />
      {splitting ? (
        <SplitFields
          context={context}
          room={room}
          onDone={(): void => {
            setSplitting(false);
          }}
        />
      ) : (
        <Button
          label="Split this room"
          icon="ruler"
          variant="outlined"
          disabled={context.readOnly}
          onPress={(): void => {
            setSplitting(true);
          }}
        />
      )}
    </View>
  );
}
