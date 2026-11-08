import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useUniwind } from 'uniwind';
import type { HomeMap, HomeMapOp, HomeMapRoom } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../../components/button';
import { Interactive } from '../../../../components/interactive';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { floorLookOf, type StructureTheme } from '../../../../components/house-map/3d/floor-looks';
import { rgbHex } from '../../../../components/house-map/iso/project';
import { cn } from '../../../../design/cn';
import { Block, CeilingsBlock, type MaterialsCtx } from './materials-ceiling';
import {
  FINISH_SURFACES,
  FINISH_SURFACE_LABELS,
  FLOOR_CHOICES,
  FLOOR_TINTS,
  MATERIALS_LABEL,
  VIEW_H,
  VIEW_W,
  WALL_CHOICES,
  box,
  matchRoomOps,
  patternPath,
  tintOps,
  type FinishPick,
  type FloorChoice,
  type WallChoice,
} from './materials-model';

export interface MaterialsPanelProps {
  readonly map: HomeMap;
  readonly floorId: string | null;
  readonly selectedId: string | null;
  readonly readOnly: boolean;
  readonly pick: FinishPick;
  readonly onPick: (pick: FinishPick) => void;
  readonly edit: (ops: readonly HomeMapOp[]) => Promise<unknown>;
}

const NO_RGB = [0, 0, 0] as const;

const COLUMNS = 4;

const SURFACE_OPTIONS = FINISH_SURFACES.map((value) => ({
  value,
  label: FINISH_SURFACE_LABELS[value],
}));

const TINT_OPTIONS: readonly { readonly hex: string | null; readonly label: string }[] = [
  { hex: null, label: 'Natural' },
  ...FLOOR_TINTS.map((tint) => ({ hex: tint.hex, label: tint.label })),
];

function rowsOf<T>(items: readonly T[]): readonly (readonly T[])[] {
  return Array.from({ length: Math.ceil(items.length / COLUMNS) }, (_, row) =>
    items.slice(row * COLUMNS, row * COLUMNS + COLUMNS),
  );
}

interface FinishTileProps {
  readonly label: string;
  readonly armed: boolean;
  readonly onPress: () => void;
  readonly children: ReactNode;
}

function FinishTile({ label, armed, onPress, children }: FinishTileProps): ReactNode {
  return (
    <Interactive
      role="radio"
      label={label}
      selected={armed}
      onPress={onPress}
      className={cn(
        'min-h-touch-min flex-1 overflow-hidden rounded-md border-2',
        armed ? 'border-primary' : 'border-transparent',
      )}
    >
      <View className="h-16 w-full overflow-hidden rounded-sm bg-surface-2">{children}</View>
      <View className="absolute bottom-1 left-1 right-1 flex-row">
        <View className="max-w-full rounded-full bg-surface px-2 py-0.5">
          <Text variant="caption" numberOfLines={1}>
            {label}
          </Text>
        </View>
      </View>
    </Interactive>
  );
}

interface FinishGridProps<T> {
  readonly label: string;
  readonly items: readonly T[];
  readonly keyOf: (item: T) => string;
  readonly render: (item: T) => ReactNode;
}

function FinishGrid<T>({ label, items, keyOf, render }: FinishGridProps<T>): ReactNode {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="gap-2">
      {rowsOf(items).map((row) => (
        <View key={row.map(keyOf).join('|')} className="flex-row gap-2">
          {row.map(render)}
          {Array.from({ length: COLUMNS - row.length }, (_, index) => (
            <View key={`gap-${String(index)}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}

function FloorPreview({
  item,
  theme,
}: {
  readonly item: FloorChoice;
  readonly theme: StructureTheme;
}): ReactNode {
  const look = floorLookOf(
    { status: 'material', kind: item.kind, variant: item.variant, tint: null },
    NO_RGB,
    { tone: 'material', theme },
  );
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <Path d={box(0, 0, VIEW_W, VIEW_H)} fill={rgbHex(look.base)} />
      <Path
        d={patternPath(look.pattern, look.scaleMetres)}
        stroke={rgbHex(look.joint)}
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

interface PickProps {
  readonly pick: FinishPick;
  readonly onPick: (pick: FinishPick) => void;
}

function FloorFinishes({ pick, onPick }: PickProps): ReactNode {
  const theme: StructureTheme = useUniwind().theme === 'light' ? 'light' : 'dark';
  return (
    <FinishGrid
      label="Floor finish"
      items={FLOOR_CHOICES}
      keyOf={(item) => item.id}
      render={(item) => (
        <FinishTile
          key={item.id}
          label={item.label}
          armed={pick.floor.id === item.id}
          onPress={(): void => {
            onPick({ ...pick, floor: item });
          }}
        >
          <FloorPreview item={item} theme={theme} />
        </FinishTile>
      )}
    />
  );
}

function WallSample({ choice }: { readonly choice: WallChoice }): ReactNode {
  return choice.hex === null ? (
    <View className="h-full w-full border-hairline border-outline-variant bg-surface-2" />
  ) : (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`}
      preserveAspectRatio="none"
    >
      <Path d={box(0, 0, VIEW_W, VIEW_H)} fill={choice.hex} />
    </Svg>
  );
}

function WallFinishes({ pick, onPick }: PickProps): ReactNode {
  return (
    <FinishGrid
      label="Wall finish"
      items={WALL_CHOICES}
      keyOf={(item) => item.id}
      render={(item) => (
        <FinishTile
          key={item.id}
          label={item.label}
          armed={pick.wall.id === item.id}
          onPress={(): void => {
            onPick({ ...pick, wall: item });
          }}
        >
          <WallSample choice={item} />
        </FinishTile>
      )}
    />
  );
}

interface SwatchProps {
  readonly option: { readonly hex: string | null; readonly label: string };
  readonly selected: boolean;
  readonly readOnly: boolean;
  readonly onPick: (hex: string | null) => void;
}

function Swatch({ option, selected, readOnly, onPick }: SwatchProps): ReactNode {
  return (
    <Interactive
      role="radio"
      label={option.label}
      selected={selected}
      disabled={readOnly}
      onPress={(): void => {
        if (!selected) onPick(option.hex);
      }}
      className={cn(
        'min-h-touch-min min-w-touch-min items-center justify-center rounded-full',
        readOnly && 'opacity-40',
      )}
      layerClassName="rounded-full"
    >
      <View
        className={cn(
          'size-10 items-center justify-center rounded-full border-2',
          selected ? 'border-on-surface' : 'border-transparent',
        )}
      >
        <View
          className="size-8 rounded-full border-hairline border-outline-variant bg-surface-2"
          style={option.hex === null ? undefined : { backgroundColor: option.hex }}
        />
      </View>
    </Interactive>
  );
}

interface RoomProps {
  readonly room: HomeMapRoom;
  readonly ctx: MaterialsCtx;
}

function TintSwatches({ room, ctx }: RoomProps): ReactNode {
  const value = room.floorMaterial.tint?.toLowerCase() ?? null;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Floor tint"
      className="flex-row flex-wrap gap-1"
    >
      {TINT_OPTIONS.map((option) => (
        <Swatch
          key={option.label}
          option={option}
          selected={(option.hex?.toLowerCase() ?? null) === value}
          readOnly={ctx.readOnly}
          onPick={(hex): void => {
            ctx.send(tintOps(ctx.floor.id, [room], hex), 'home_map.tint_failed');
          }}
        />
      ))}
    </View>
  );
}

function RoomFloor({ room, ctx }: RoomProps): ReactNode {
  return (
    <>
      <Block title={`Floor tint of ${room.name ?? 'this room'}`}>
        <TintSwatches room={room} ctx={ctx} />
      </Block>
      <Button
        label="Use this floor and paint in every room"
        variant="tonal"
        icon="palette"
        disabled={ctx.readOnly || ctx.floor.rooms.length < 2}
        onPress={(): void => {
          ctx.send(
            matchRoomOps(ctx.floor.id, room, ctx.floor.rooms),
            'home_map.match_rooms_failed',
          );
        }}
      />
    </>
  );
}

interface SurfaceBodyProps extends PickProps {
  readonly ctx: MaterialsCtx;
  readonly room: HomeMapRoom | null;
}

function SurfaceBody({ pick, onPick, ctx, room }: SurfaceBodyProps): ReactNode {
  if (pick.surface === 'ceilings') return <CeilingsBlock ctx={ctx} room={room} />;
  if (pick.surface === 'walls') return <WallFinishes pick={pick} onPick={onPick} />;
  return (
    <>
      <FloorFinishes pick={pick} onPick={onPick} />
      {room === null ? null : <RoomFloor room={room} ctx={ctx} />}
    </>
  );
}

export function MaterialsPanel(props: MaterialsPanelProps): ReactNode {
  const { map, floorId, selectedId, readOnly, edit, pick, onPick } = props;
  const floor = map.floors.find((item) => item.id === floorId);
  if (floor === undefined) return null;
  const ctx: MaterialsCtx = {
    floor,
    readOnly,
    send: (ops, event): void => {
      if (ops.length > 0) background(edit(ops), event);
    },
  };
  const room = floor.rooms.find((item) => item.id === selectedId) ?? null;
  return (
    <View accessibilityLabel={MATERIALS_LABEL} className="gap-4">
      <Segmented
        label="Finish for"
        fill
        value={pick.surface}
        options={SURFACE_OPTIONS}
        onChange={(surface): void => {
          onPick({ ...pick, surface });
        }}
      />
      <SurfaceBody pick={pick} onPick={onPick} ctx={ctx} room={room} />
    </View>
  );
}
