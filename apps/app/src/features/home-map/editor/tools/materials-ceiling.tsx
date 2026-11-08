import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { HomeMapFloor, HomeMapOp, HomeMapRoom } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { NumberStepper } from '../../../../components/number-stepper';
import { Text } from '../../../../components/text';
import { useColourResolver } from '../../../../design/colour';
import {
  CEILING_HINT,
  CEILING_RANGE,
  VIEW_H,
  VIEW_W,
  box,
  floorCeilingOps,
  roomCeilingOps,
} from './materials-model';

export interface MaterialsCtx {
  readonly floor: HomeMapFloor;
  readonly readOnly: boolean;
  readonly send: (ops: readonly HomeMapOp[], event: string) => void;
}

const DOOR_M = { width: 0.9, height: 2 } as const;

export function Block({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function CeilingSection({ height }: { readonly height: number }): ReactNode {
  const resolve = useColourResolver();
  const top = Math.max(height, DOOR_M.height) + 0.3;
  const y = (metres: number): number => ((top - metres) / top) * VIEW_H;
  const ceiling = y(height).toFixed(1);
  return (
    <Svg
      width="100%"
      height={56}
      viewBox={`0 0 ${String(VIEW_W * 2)} ${String(VIEW_H)}`}
      accessible={false}
    >
      <Path d={box(0, y(0), VIEW_W * 2, VIEW_H - y(0) + 1)} fill={resolve('outline-variant')} />
      <Path d={`M0 ${ceiling}H${String(VIEW_W * 2)}`} stroke={resolve('primary')} strokeWidth={2} />
      <Path
        d={box(40, y(DOOR_M.height), (DOOR_M.width / top) * VIEW_H, y(0) - y(DOOR_M.height))}
        stroke={resolve('on-surface-variant')}
        strokeWidth={1}
        fill="none"
      />
      <Path
        d={`M150 ${ceiling}V${y(0).toFixed(1)}`}
        stroke={resolve('primary')}
        strokeWidth={1}
        strokeDasharray="2 2"
      />
    </Svg>
  );
}

function RoomCeiling({
  room,
  ctx,
}: {
  readonly room: HomeMapRoom;
  readonly ctx: MaterialsCtx;
}): ReactNode {
  const floorId = ctx.floor.id;
  const height = room.ceilingHeight ?? ctx.floor.ceilingHeight;
  const title = `Ceiling height of ${room.name ?? 'this room'}`;
  return (
    <Block title={title}>
      <CeilingSection height={height} />
      <NumberStepper
        label={title}
        unit="m"
        value={height}
        {...CEILING_RANGE}
        disabled={ctx.readOnly}
        onChange={(value): void => {
          ctx.send(roomCeilingOps(floorId, room, value), 'home_map.room_ceiling_failed');
        }}
      />
      {room.ceilingHeight === null ? null : (
        <Button
          label="Use the floor height"
          variant="text"
          icon="undo"
          disabled={ctx.readOnly}
          onPress={(): void => {
            ctx.send(roomCeilingOps(floorId, room, null), 'home_map.room_ceiling_failed');
          }}
        />
      )}
    </Block>
  );
}

export function CeilingsBlock({
  ctx,
  room,
}: {
  readonly ctx: MaterialsCtx;
  readonly room: HomeMapRoom | null;
}): ReactNode {
  return (
    <>
      <Block title={`Ceiling height of ${ctx.floor.name}`}>
        <NumberStepper
          label={`Ceiling height of ${ctx.floor.name}`}
          unit="m"
          value={ctx.floor.ceilingHeight}
          {...CEILING_RANGE}
          disabled={ctx.readOnly}
          onChange={(value): void => {
            ctx.send(floorCeilingOps(ctx.floor, value), 'home_map.floor_ceiling_failed');
          }}
        />
      </Block>
      {room === null ? (
        <Text variant="footnote" tone="variant">
          {CEILING_HINT}
        </Text>
      ) : (
        <RoomCeiling room={room} ctx={ctx} />
      )}
    </>
  );
}
