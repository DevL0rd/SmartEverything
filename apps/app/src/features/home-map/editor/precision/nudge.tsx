import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { HomeMapObject, HomeMapOp, HomeMapRoom, HomeMapVec } from '@smarteverything/domain';
import { IconButton } from '../../../../components/icon-button';
import type { IconName } from '../../../../components/icon';
import { Segmented, type SegmentedOption } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { useIsPhone } from '../../../../design/size-class';
import type { FurnitureTool } from '../tools/furniture';
import { ROTATE_STEP_DEG } from '../tools/furniture-model';
import type { RoomsDraw } from '../tools/rooms-draw';
import { cleanRing, validRing, type DrawRing } from '../tools/rooms-draw-geometry';
import { reshapeRoomOp } from '../tools/rooms-draw-model';

export type NudgeStep = 'cm1' | 'cm10';

export const NUDGE_STEP_M: Readonly<Record<NudgeStep, number>> = { cm1: 0.01, cm10: 0.1 };

export type NudgeDirection = 'left' | 'up' | 'down' | 'right';

export const NUDGE_DIRECTIONS: readonly NudgeDirection[] = ['left', 'up', 'down', 'right'];

const DIRECTION_VECTOR: Readonly<Record<NudgeDirection, HomeMapVec>> = {
  left: { x: -1, y: 0 },
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
};

const DIRECTION_ICON: Readonly<Record<NudgeDirection, IconName>> = {
  left: 'chevronLeft',
  up: 'chevronUp',
  down: 'chevronDown',
  right: 'chevronRight',
};

const STEP_LABEL: Readonly<Record<NudgeStep, string>> = { cm1: '1 cm', cm10: '10 cm' };

const STEP_OPTIONS: readonly SegmentedOption<NudgeStep>[] = [
  { value: 'cm1', label: STEP_LABEL.cm1, spoken: 'One centimetre steps' },
  { value: 'cm10', label: STEP_LABEL.cm10, spoken: 'Ten centimetre steps' },
];

const MM = 1000;

const toMm = (value: number): number => Math.round(value * MM) / MM;

export function nudgeVector(direction: NudgeDirection, step: NudgeStep): HomeMapVec {
  const unit = DIRECTION_VECTOR[direction];
  const metres = NUDGE_STEP_M[step];
  return { x: unit.x * metres, y: unit.y * metres };
}

export type NudgeTarget =
  | { readonly kind: 'room'; readonly room: HomeMapRoom }
  | { readonly kind: 'corner'; readonly room: HomeMapRoom; readonly index: number };

const shift = (point: HomeMapVec, by: HomeMapVec): HomeMapVec => ({
  x: toMm(point.x + by.x),
  y: toMm(point.y + by.y),
});

export function nudgedRing(target: NudgeTarget, by: HomeMapVec): DrawRing {
  const ring = target.room.polygon.outer;
  if (target.kind === 'room') return ring.map((point) => shift(point, by));
  return ring.map((point, index) => (index === target.index ? shift(point, by) : point));
}

export function nudgeOp(floorId: string, target: NudgeTarget, by: HomeMapVec): HomeMapOp | null {
  const ring = cleanRing(nudgedRing(target, by));
  if (!validRing(ring)) return null;
  const holes = target.room.polygon.holes;
  return reshapeRoomOp(
    floorId,
    target.room.id,
    ring,
    target.kind === 'room'
      ? holes.map((hole) => hole.map((point) => ({ ...point, ...shift(point, by) })))
      : holes,
  );
}

export function nudgeTitle(target: NudgeTarget | null): string {
  if (target === null) return 'Select a room to nudge it';
  const name = target.room.name ?? 'room';
  return target.kind === 'room'
    ? `Nudge ${name}`
    : `Nudge corner ${String(target.index + 1)} of ${name}`;
}

export interface NudgePadProps {
  readonly title: string;
  readonly disabled: boolean;
  readonly onNudge: (by: HomeMapVec) => void;
}

export function NudgePad({ title, disabled, onNudge }: NudgePadProps): ReactNode {
  const [step, setStep] = useState<NudgeStep>('cm10');
  return (
    <View className="gap-2 rounded-md bg-surface-2 p-3">
      <Text variant="body-strong" numberOfLines={1}>
        {title}
      </Text>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Segmented
          options={STEP_OPTIONS}
          value={step}
          onChange={setStep}
          label="Nudge step"
          disabled={disabled}
          compact
        />
        <View className="flex-row gap-1">
          {NUDGE_DIRECTIONS.map((direction) => (
            <IconButton
              key={direction}
              icon={DIRECTION_ICON[direction]}
              label={`Nudge ${direction} by ${STEP_LABEL[step]}`}
              variant="raised"
              disabled={disabled}
              onPress={(): void => {
                onNudge(nudgeVector(direction, step));
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

export function roomsNudgeTarget(draw: RoomsDraw): NudgeTarget | null {
  const room = draw.floor?.rooms.find((item) => item.id === draw.selected) ?? null;
  return room === null ? null : { kind: 'room', room };
}

export function RoomsNudge({ draw }: { readonly draw: RoomsDraw }): ReactNode {
  const target = roomsNudgeTarget(draw);
  const floorId = draw.floor?.id ?? null;
  return (
    <NudgePad
      title={nudgeTitle(target)}
      disabled={target === null || draw.readOnly || draw.state.draft.kind !== 'idle'}
      onNudge={(by): void => {
        if (target === null || floorId === null) return;
        const op = nudgeOp(floorId, target, by);
        if (op === null) return;
        draw.apply((state) => ({ state, ops: [op], select: null }));
      }}
    />
  );
}

export function pieceNudgeOp(floorId: string, object: HomeMapObject, by: HomeMapVec): HomeMapOp {
  return { op: 'move', kind: 'object', floorId, id: object.id, dx: by.x, dy: by.y };
}

export interface PieceNudgeProps {
  readonly tool: Pick<FurnitureTool, 'floor' | 'readOnly' | 'nameOf' | 'send'>;
  readonly object: HomeMapObject;
}

export function PieceNudge({ tool, object }: PieceNudgeProps): ReactNode {
  const phone = useIsPhone();
  const { floor } = tool;
  if (!phone || floor === null || object.wall !== undefined) return null;
  return (
    <NudgePad
      title={`Nudge ${tool.nameOf(object.id)}`}
      disabled={tool.readOnly || object.locked}
      onNudge={(by): void => {
        tool.send([pieceNudgeOp(floor.id, object, by)]);
      }}
    />
  );
}

export function turnedBy(rotation: number, by: number): number {
  return (((rotation + by) % 360) + 360) % 360;
}

export interface TurnPadProps {
  readonly object: HomeMapObject;
  readonly disabled: boolean;
  readonly onPatch: (patch: Partial<HomeMapObject>) => void;
}

const TURNS: readonly { readonly icon: IconName; readonly by: number; readonly label: string }[] = [
  { icon: 'undo', by: -ROTATE_STEP_DEG, label: `Turn left ${String(ROTATE_STEP_DEG)} degrees` },
  { icon: 'redo', by: ROTATE_STEP_DEG, label: `Turn right ${String(ROTATE_STEP_DEG)} degrees` },
  { icon: 'refresh', by: 90, label: 'Turn a quarter' },
];

export function TurnPad({ object, disabled, onPatch }: TurnPadProps): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {`Turned ${String(Math.round(object.rotation))}°`}
      </Text>
      {TURNS.map((turn) => (
        <IconButton
          key={turn.label}
          icon={turn.icon}
          label={turn.label}
          disabled={disabled}
          onPress={(): void => {
            onPatch({ rotation: turnedBy(object.rotation, turn.by) });
          }}
        />
      ))}
    </View>
  );
}
