import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import {
  homeMapWallLength,
  placementFacts,
  type HomeMapFloor,
  type HomeMapObject,
  type HomeMapWall,
  type HomeMapWallAttachment,
} from '@smarteverything/domain';
import { Icon } from '../../../../components/icon';
import type { IconName } from '../../../../components/icon-glyphs';
import { Interactive } from '../../../../components/interactive';
import { NumberStepper } from '../../../../components/number-stepper';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import { useColourResolver } from '../../../../design/colour';
import { cn } from '../../../../design/cn';
import { useRooms } from '../../../../store/selectors';
import type { HubRoom } from '../list-editor/rooms-walls-model';
import type { FurnitureTool } from './furniture';
import {
  OTHER_SIDE_TEXT,
  WALL_FINE_M,
  WALL_GRID_M,
  centreOffset,
  facingOf,
  isWallModel,
  sizeOf,
  stepOffset,
  wallAttachPatch,
  wallSpotAt,
  wallHeightOf,
  wallOf,
  type WallSize,
  type WallSpot,
} from './wall-place';

export const WALL_SECTION_LABEL = 'On the wall';
export const ABOVE_FLOOR_LABEL = 'Above floor';
export const MOUNT_HEIGHT_HINT = 'Height of its centre';
export const ALONG_LABEL = 'Along the wall';
export const FACING_LABEL = 'Facing';
export const SNAP_LABEL = 'Snap to walls';
export const CENTRE_LABEL = 'Centre on the wall';
export const GRID_LABEL = 'Grid 10 cm';
export const NOT_ON_WALL_TEXT = 'Not on a wall yet. Snap it to the nearest wall.';

const ELEVATION_PX = 112;
const PAD_PX = 16;
const LABEL_PX = 12;

export type WallChange = Partial<Pick<HomeMapWallAttachment, 'offset' | 'side'>>;

export interface WallSectionProps {
  readonly floor: Pick<HomeMapFloor, 'walls' | 'rooms' | 'ceilingHeight'>;
  readonly attachment: HomeMapWallAttachment | undefined;
  readonly heightM: number;
  readonly size: WallSize & { readonly tall: number };
  readonly hubRooms: readonly HubRoom[];
  readonly disabled: boolean;
  readonly onHeight: (metres: number) => void;
  readonly onAttach: (change: WallChange) => void;
}

interface Drawing {
  readonly floor: string;
  readonly wall: string;
  readonly object: string;
  readonly stem: string;
  readonly tick: string;
  readonly label: { readonly x: number; readonly y: number };
}

function box(x: number, y: number, w: number, h: number): string {
  return `M${String(x)} ${String(y)}h${String(w)}v${String(h)}h${String(-w)}Z`;
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `M${String(x1)} ${String(y1)}L${String(x2)} ${String(y2)}`;
}

export function elevationDrawing(
  width: number,
  wallM: number,
  heightM: number,
  size: WallSectionProps['size'],
): Drawing {
  const tall = Math.max(size.tall, 0.02);
  const top = Math.max(wallM, heightM + tall / 2, 0.01);
  const perM = (ELEVATION_PX - 2 * PAD_PX) / top;
  const floorY = ELEVATION_PX - PAD_PX;
  const toY = (metres: number): number => floorY - metres * perM;
  const wallX = width * 0.42;
  const slab = Math.max(6, 0.12 * perM);
  const objectH = Math.max(4, tall * perM);
  const objectW = Math.max(6, size.depth * perM);
  const centreY = toY(heightM);
  const face = wallX + slab;
  const dimX = face + objectW + 18;
  return {
    floor: line(PAD_PX, floorY, width - PAD_PX, floorY),
    wall: box(wallX, toY(wallM), slab, floorY - toY(wallM)),
    object: box(face, centreY - objectH / 2, objectW, objectH),
    stem: line(dimX, floorY, dimX, centreY),
    tick: line(face + objectW, centreY, dimX + 6, centreY),
    label: { x: dimX + 8, y: (floorY + centreY) / 2 + LABEL_PX / 3 },
  };
}

function ElevationDrawing({
  width,
  wallM,
  heightM,
  size,
}: {
  readonly width: number;
  readonly wallM: number;
  readonly heightM: number;
  readonly size: WallSectionProps['size'];
}): ReactNode {
  const colour = useColourResolver();
  const drawn = elevationDrawing(width, wallM, heightM, size);
  const accent = colour('primary');
  return (
    <Svg width={width} height={ELEVATION_PX}>
      <Path d={drawn.floor} stroke={colour('on-surface-variant')} strokeWidth={2} />
      <Path d={drawn.wall} fill={colour('surface-3')} stroke={colour('outline')} strokeWidth={1} />
      <Path d={drawn.object} fill={colour('primary-container')} stroke={accent} strokeWidth={2} />
      <Path d={drawn.stem} stroke={accent} strokeWidth={1} strokeDasharray="4 3" />
      <Path d={drawn.tick} stroke={accent} strokeWidth={1} />
      <SvgText
        transform={`translate(${String(drawn.label.x)} ${String(drawn.label.y)})`}
        fontSize={LABEL_PX}
        fontWeight="600"
        fill={accent}
      >
        {`${heightM.toFixed(2)} m`}
      </SvgText>
    </Svg>
  );
}

function Elevation(props: {
  readonly wallM: number;
  readonly heightM: number;
  readonly size: WallSectionProps['size'];
}): ReactNode {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => {
    const next = event.nativeEvent.layout.width;
    setWidth((previous) => (previous === next ? previous : next));
  };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Side view: its centre is ${props.heightM.toFixed(2)} m above the floor on a ${props.wallM.toFixed(2)} m wall`}
      className="h-28 w-full overflow-hidden rounded-md bg-surface-1"
      onLayout={onLayout}
    >
      {width === 0 ? null : <ElevationDrawing width={width} {...props} />}
    </View>
  );
}

function SnapChip({
  label,
  icon,
  selected,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly icon: IconName;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      role="button"
      label={label}
      selected={selected}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-touch-min flex-row items-center gap-1.5 rounded-full px-3',
        selected ? 'bg-primary-container' : 'bg-surface-1',
        disabled && 'opacity-60',
      )}
    >
      <Icon name={icon} size={16} tone={selected ? 'onPrimaryContainer' : 'variant'} />
      <Text variant="footnote" tone={selected ? 'onPrimaryContainer' : 'default'}>
        {label}
      </Text>
    </Interactive>
  );
}

function Placing({
  section,
  wall,
  grid,
}: {
  readonly section: WallSectionProps;
  readonly wall: HomeMapWall;
  readonly grid: boolean;
}): ReactNode {
  const { attachment, disabled, onAttach } = section;
  if (attachment === undefined) return null;
  const facing = facingOf(section.floor, wall, attachment, section.hubRooms);
  const flip = attachment.side === 'left' ? 'right' : 'left';
  const step = grid ? WALL_GRID_M : WALL_FINE_M;
  return (
    <>
      <NumberStepper
        label={ALONG_LABEL}
        unit="m"
        step={step}
        min={0}
        max={homeMapWallLength(wall)}
        value={attachment.offset}
        disabled={disabled}
        onChange={(offset): void => {
          onAttach({ offset: grid ? stepOffset(offset, WALL_GRID_M) : offset });
        }}
      />
      <Segmented
        label={FACING_LABEL}
        fill
        options={[
          { value: attachment.side, label: facing },
          { value: flip, label: OTHER_SIDE_TEXT },
        ]}
        value={attachment.side}
        disabled={disabled}
        onChange={(side): void => {
          if (side !== attachment.side) onAttach({ side });
        }}
      />
    </>
  );
}

function Snapping({
  section,
  wall,
  grid,
  setGrid,
}: {
  readonly section: WallSectionProps;
  readonly wall: HomeMapWall | null;
  readonly grid: boolean;
  readonly setGrid: (grid: boolean) => void;
}): ReactNode {
  const { attachment, disabled, onAttach } = section;
  const centre = wall === null ? null : centreOffset(wall);
  const centred = centre !== null && Math.abs((attachment?.offset ?? -1) - centre) < WALL_FINE_M;
  return (
    <View className="flex-row flex-wrap gap-1.5">
      <SnapChip
        label={SNAP_LABEL}
        icon="move"
        selected={wall !== null}
        disabled={disabled}
        onPress={(): void => {
          onAttach({});
        }}
      />
      <SnapChip
        label={CENTRE_LABEL}
        icon="locate"
        selected={centred}
        disabled={disabled || centre === null}
        onPress={(): void => {
          if (centre !== null) onAttach({ offset: centre });
        }}
      />
      <SnapChip
        label={GRID_LABEL}
        icon="grid"
        selected={grid}
        disabled={disabled}
        onPress={(): void => {
          setGrid(!grid);
        }}
      />
    </View>
  );
}

export function WallSection(props: WallSectionProps): ReactNode {
  const [grid, setGrid] = useState(true);
  const wall = wallOf(props.floor, props.attachment?.wallId);
  const wallM = wallHeightOf(wall, props.floor);
  return (
    <View accessibilityLabel={WALL_SECTION_LABEL} className="gap-3">
      <Elevation wallM={wallM} heightM={props.heightM} size={props.size} />
      <View className="gap-1">
        <NumberStepper
          label={ABOVE_FLOOR_LABEL}
          unit="m"
          step={grid ? WALL_GRID_M : WALL_FINE_M}
          min={0}
          max={Number.MAX_SAFE_INTEGER}
          value={props.heightM}
          disabled={props.disabled}
          onChange={props.onHeight}
        />
        <Text variant="caption" tone="variant">
          {MOUNT_HEIGHT_HINT}
        </Text>
      </View>
      {wall === null ? (
        <Text variant="footnote" tone="variant">
          {NOT_ON_WALL_TEXT}
        </Text>
      ) : (
        <Placing section={props} wall={wall} grid={grid} />
      )}
      <Snapping section={props} wall={wall} grid={grid} setGrid={setGrid} />
    </View>
  );
}

export function wallSpotFor(
  floor: Pick<HomeMapFloor, 'walls' | 'rooms'>,
  current: { readonly at: HomeMapObject['at']; readonly wall?: HomeMapWallAttachment | undefined },
  change: WallChange,
  size: WallSize,
): WallSpot | null {
  const resnap = change.offset === undefined && change.side === undefined;
  if (resnap || current.wall === undefined) return wallSpotAt(floor, current.at, size);
  return wallAttachPatch(floor, current.wall, change, size);
}

export function ObjectWallSection({
  tool,
  object,
}: {
  readonly tool: FurnitureTool;
  readonly object: HomeMapObject;
}): ReactNode {
  const hubRooms = useRooms();
  const { floor } = tool;
  const spec = tool.specOf(object.modelId);
  if (floor === null || !isWallModel(object.modelId, spec)) return null;
  const size = sizeOf(object.modelId, tool.specOf);
  const tall = placementFacts(object.modelId, spec)?.footprint.h ?? 0;
  return (
    <WallSection
      floor={floor}
      attachment={object.wall}
      heightM={object.elevation}
      size={{ ...size, tall }}
      hubRooms={hubRooms}
      disabled={tool.readOnly || object.locked}
      onHeight={(elevation): void => {
        tool.patch(object.id, { elevation });
      }}
      onAttach={(change): void => {
        const spot = wallSpotFor(floor, object, change, size);
        if (spot !== null) tool.patch(object.id, spot);
      }}
    />
  );
}
