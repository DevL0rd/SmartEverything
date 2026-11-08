import { randomUUID } from 'expo-crypto';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { homeMapSnapRotation, type HomeMapObject, type HomeMapRoom } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { objectOp } from '../../../../components/house-map/edit/ops';
import { ListRow } from '../../../../components/list-row';
import { NumberStepper } from '../../../../components/number-stepper';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import { compareText } from '../../../../format/text';
import { CmField, ListItem, PointFields, ShapeThumb, UNBOUNDED_CM } from './list-parts';
import {
  duplicateOp,
  footprintRing,
  objectTitle,
  OUTSIDE_TEXT,
  roomIdAt,
  roomNameAt,
  words,
  type ItemsContext,
} from './objects-devices-model';

export function RoomChoice({
  context,
  current,
  disabled,
  onChoose,
  label = 'Room',
  emptyText = OUTSIDE_TEXT,
}: {
  readonly context: ItemsContext;
  readonly current: string | null;
  readonly disabled: boolean;
  readonly onChoose: (room: HomeMapRoom) => void;
  readonly label?: string;
  readonly emptyText?: string;
}): ReactNode {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="gap-1">
      <Text variant="body-strong">{label}</Text>
      {current === null ? (
        <Text variant="caption" tone="variant">
          {emptyText}
        </Text>
      ) : null}
      {context.rooms.map(({ room, title }) => (
        <ListRow
          key={room.id}
          icon="square"
          title={title}
          checked={current === room.id}
          disabled={disabled}
          onPress={(): void => {
            if (current !== room.id) onChoose(room);
          }}
        />
      ))}
    </View>
  );
}

export function DegreeField({
  label,
  value,
  range,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly range: readonly [number, number];
  readonly disabled: boolean;
  readonly onChange: (degrees: number) => void;
}): ReactNode {
  return (
    <NumberStepper
      label={label}
      unit="°"
      step={1}
      value={Math.round(value)}
      min={range[0]}
      max={range[1]}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

export const TURN_RANGE = [0, 359] as const;

function LabelField({
  object,
  disabled,
  onCommit,
}: {
  readonly object: HomeMapObject;
  readonly disabled: boolean;
  readonly onCommit: (label: string | null) => void;
}): ReactNode {
  const [draft, setDraft] = useState(object.label ?? '');
  const commit = (): void => {
    const next = draft.trim() === '' ? null : draft.trim();
    if (next !== object.label) onCommit(next);
  };
  return (
    <TextField
      label="Label"
      value={draft}
      disabled={disabled}
      onChange={setDraft}
      onBlur={commit}
      onSubmit={commit}
    />
  );
}

interface ObjectProps {
  readonly context: ItemsContext;
  readonly object: HomeMapObject;
}

function SizeFields({
  object,
  disabled,
  patch,
}: {
  readonly object: HomeMapObject;
  readonly disabled: boolean;
  readonly patch: (next: Partial<HomeMapObject>) => void;
}): ReactNode {
  const params = Object.entries(object.params).sort(([a], [b]) => compareText(a, b));
  return (
    <>
      <CmField
        label="Raised above the floor"
        value={object.elevation}
        min={0}
        disabled={disabled}
        onChange={(elevation): void => {
          patch({ elevation });
        }}
      />
      {params.map(([name, value]) => (
        <NumberStepper
          key={name}
          label={words(name)}
          step={0.01}
          value={value}
          min={0}
          max={UNBOUNDED_CM}
          disabled={disabled}
          onChange={(next): void => {
            patch({ params: { ...object.params, [name]: next } });
          }}
        />
      ))}
    </>
  );
}

function ObjectFields({ context, object }: ObjectProps): ReactNode {
  const fixed = context.readOnly || object.locked;
  const patch = (next: Partial<HomeMapObject>): void => {
    context.apply([objectOp(context.floor.id, object.id, next)]);
  };
  return (
    <>
      <LabelField
        key={object.label ?? ''}
        object={object}
        disabled={fixed}
        onCommit={(label): void => {
          patch({ label });
        }}
      />
      <RoomChoice
        context={context}
        current={roomIdAt(context.floor, object.at)}
        disabled={fixed}
        onChoose={(room): void => {
          patch({ at: room.labelAt });
        }}
      />
      <PointFields
        label="Position"
        point={object.at}
        disabled={fixed}
        onChange={(at): void => {
          patch({ at: { x: at.x, y: at.y } });
        }}
      />
      <DegreeField
        label="Rotation"
        value={object.rotation}
        range={TURN_RANGE}
        disabled={fixed}
        onChange={(rotation): void => {
          patch({ rotation: homeMapSnapRotation(rotation, null) });
        }}
      />
      <SizeFields object={object} disabled={fixed} patch={patch} />
    </>
  );
}

function ObjectActions({ context, object }: ObjectProps): ReactNode {
  const floorId = context.floor.id;
  const fixed = context.readOnly || object.locked;
  const apply = (op: Parameters<typeof context.apply>[0][number]): void => {
    context.apply([op]);
  };
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label={object.locked ? 'Unlock' : 'Lock'}
        icon="lock"
        variant="tonal"
        disabled={context.readOnly}
        onPress={(): void => {
          apply(objectOp(floorId, object.id, { locked: !object.locked }));
        }}
      />
      <Button
        label="Flip"
        icon="reset"
        variant="tonal"
        disabled={fixed}
        onPress={(): void => {
          apply(objectOp(floorId, object.id, { flipped: object.flipped !== true }));
        }}
      />
      <Button
        label="Duplicate"
        icon="copy"
        variant="tonal"
        disabled={context.readOnly}
        onPress={(): void => {
          apply(duplicateOp(floorId, object, randomUUID()));
        }}
      />
      <Button
        label="Delete"
        icon="trash"
        variant="destructive"
        disabled={fixed}
        onPress={(): void => {
          apply({ op: 'remove', kind: 'object', floorId, id: object.id });
        }}
      />
    </View>
  );
}

export function objectSubtitle(context: ItemsContext, object: HomeMapObject): string {
  const parts = [roomNameAt(context, object.at), `${String(Math.round(object.rotation))}°`];
  return [...parts, ...(object.locked ? ['locked'] : [])].join(' · ');
}

export function ObjectItem({
  context,
  object,
  open,
  onToggle,
}: ObjectProps & { readonly open: boolean; readonly onToggle: () => void }): ReactNode {
  return (
    <ListItem
      title={objectTitle(object)}
      subtitle={objectSubtitle(context, object)}
      thumb={<ShapeThumb points={footprintRing(object)} closed />}
      open={open}
      onToggle={onToggle}
    >
      <ObjectFields context={context} object={object} />
      <ObjectActions context={context} object={object} />
    </ListItem>
  );
}
