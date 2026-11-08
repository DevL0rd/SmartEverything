import { useId, useMemo, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { ClipPath, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { useUniwind } from 'uniwind';
import { cn } from '../../../design/cn';
import { useColourResolver } from '../../../design/colour';
import type { StructureTheme } from '../3d/floor-looks';
import { roomColourOf, useRoomColours, type RoomColours } from '../plan/room-colours';
import { mapAspectClass } from '../plan/aspect';
import { describePlan } from '../plan/rooms';
import {
  buildIsoStill,
  type IsoMark,
  type IsoSolid,
  type IsoStillInput,
  type IsoStillModel,
} from './model';
import { ellipsePath, isoFloorFill } from './project';

const OCCUPIED_OPACITY = 0.28;

const ZONE_OPACITY = 0.35;

const CLEAR_ZONE_OPACITY = 0.12;

const GLASS_OPACITY = 0.45;

const EMPTY_BOUNDS = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

interface IsoColours extends RoomColours {
  readonly primary: string;
  readonly body: string;
  readonly dockInk: string;
  readonly pane: string;
  readonly objectFill: string;
  readonly objectEdge: string;
  readonly glyph: string;
  readonly pool: string;
  readonly shade: string;
  readonly wallSide: string;
  readonly wallTop: string;
  readonly exteriorTop: string;
}

function useIsoColours(): IsoColours {
  const resolve = useColourResolver();
  return {
    ...useRoomColours(),
    primary: resolve('primary'),
    body: resolve('surface-raised'),
    dockInk: resolve('surface-raised'),
    pane: resolve('info'),
    objectFill: resolve('surface-3'),
    objectEdge: resolve('outline'),
    glyph: resolve('on-surface-variant'),
    pool: resolve('temp-warm'),
    shade: resolve('scrim'),
    wallSide: resolve('surface-3'),
    wallTop: resolve('surface-raised'),
    exteriorTop: resolve('outline-variant'),
  };
}

function solidFill(
  solid: IsoSolid,
  colours: IsoColours,
): { readonly side: string; readonly top: string } {
  if (solid.kind === 'object') {
    const fill = solid.finish ?? colours.objectFill;
    return { side: fill, top: fill };
  }
  if (solid.kind === 'device') return { side: colours.body, top: colours.body };
  if (solid.kind === 'robot') return { side: colours.body, top: colours.dockInk };
  if (solid.kind === 'glass') return { side: colours.pane, top: colours.pane };
  if (solid.kind === 'exterior') return { side: colours.wallSide, top: colours.exteriorTop };
  return { side: colours.wallSide, top: colours.wallTop };
}

function MarkLayer({
  mark,
  solid,
  colours,
}: {
  readonly mark: IsoMark;
  readonly solid: IsoSolid;
  readonly colours: IsoColours;
}): ReactNode {
  const ink = solid.kind === 'object' ? colours.glyph : colours.primary;
  return (
    <G transform={mark.transform}>
      {mark.symbol?.map((layer, index) => (
        <Path
          key={String(index)}
          d={layer.d}
          fill={layer.fill}
          fillOpacity={layer.fillOpacity}
          fillRule={layer.fillRule}
          stroke={layer.stroke}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {mark.glyph === null ? null : (
        <Path
          d={mark.glyph}
          stroke={ink}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </G>
  );
}

function SolidMark({
  solid,
  colours,
}: {
  readonly solid: IsoSolid;
  readonly colours: IsoColours;
}): ReactNode {
  const fill = solidFill(solid, colours);
  const opacity = solid.kind === 'glass' ? GLASS_OPACITY : 1;
  const edge =
    solid.kind === 'device' || solid.kind === 'robot' ? colours.primary : colours.objectEdge;
  return (
    <G opacity={opacity}>
      {solid.draw.sides.map((face, index) => (
        <G key={String(index)}>
          <Path
            d={face.d}
            fill={fill.side}
            stroke={edge}
            strokeWidth={0.5}
            strokeLinejoin="round"
          />
          <Path d={face.d} fill={colours.shade} fillOpacity={face.shade} />
        </G>
      ))}
      <Path
        d={solid.draw.top}
        fill={fill.top}
        stroke={edge}
        strokeWidth={0.75}
        strokeLinejoin="round"
      />
      {solid.mark === null ? null : <MarkLayer mark={solid.mark} solid={solid} colours={colours} />}
    </G>
  );
}

function PoolsLayer({
  model,
  colours,
  id,
}: {
  readonly model: IsoStillModel;
  readonly colours: IsoColours;
  readonly id: string;
}): ReactNode {
  if (model.pools.length === 0) return null;
  return (
    <>
      <Defs>
        <RadialGradient id={`${id}-pool`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={colours.pool} stopOpacity={0.55} />
          <Stop offset="1" stopColor={colours.pool} stopOpacity={0} />
        </RadialGradient>
        {model.pools.map((group, index) =>
          group.clip === null ? null : (
            <ClipPath key={String(index)} id={`${id}-clip-${String(index)}`}>
              <Path d={group.clip} fillRule="evenodd" />
            </ClipPath>
          ),
        )}
      </Defs>
      {model.pools.map((group, index) => (
        <G
          key={String(index)}
          {...(group.clip === null ? {} : { clipPath: `url(#${id}-clip-${String(index)})` })}
        >
          {group.pools.map((pool) => (
            <Path key={pool.id} d={ellipsePath(pool)} fill={`url(#${id}-pool)`} />
          ))}
        </G>
      ))}
    </>
  );
}

export interface IsoStillCanvasProps {
  readonly input: IsoStillInput;
  readonly width: number;
  readonly height: number;
}

export function IsoStillCanvas({ input, width, height }: IsoStillCanvasProps): ReactNode {
  const colours = useIsoColours();
  const theme: StructureTheme = useUniwind().theme === 'light' ? 'light' : 'dark';
  const id = `iso${useId().replace(/[^a-z0-9]/giu, '')}`;
  const model = useMemo(() => buildIsoStill(input, { width, height }), [input, width, height]);
  return (
    <Svg width={width} height={height}>
      {model.rooms.map((room) => (
        <G key={room.id}>
          <Path
            d={room.d}
            fillRule="evenodd"
            fill={isoFloorFill(room.room, roomColourOf(colours, room.room.colourSlot), theme)}
            stroke={colours.roomEdge}
            strokeWidth={0.75}
          />
          {room.active ? (
            <Path
              d={room.d}
              fillRule="evenodd"
              fill={colours.primary}
              fillOpacity={OCCUPIED_OPACITY}
            />
          ) : null}
        </G>
      ))}
      {model.zones.map((zone, index) => (
        <Path
          key={String(index)}
          d={zone.d}
          fillRule="evenodd"
          fill={colours.primary}
          fillOpacity={zone.occupied ? ZONE_OPACITY : CLEAR_ZONE_OPACITY}
          stroke={colours.primary}
          strokeOpacity={zone.occupied ? 0 : 0.6}
        />
      ))}
      <PoolsLayer model={model} colours={colours} id={id} />
      {model.solids.map((solid) => (
        <SolidMark key={solid.id} solid={solid} colours={colours} />
      ))}
    </Svg>
  );
}

export interface IsoStillProps {
  readonly input: IsoStillInput;
  readonly name: string | null;
  readonly fill?: boolean;
  readonly className?: string | undefined;
}

export function IsoStill({ input, name, fill = false, className }: IsoStillProps): ReactNode {
  const [size, setSize] = useState<{ readonly width: number; readonly height: number } | null>(
    null,
  );
  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setSize((previous) =>
      previous?.width === width && previous.height === height ? previous : { width, height },
    );
  };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={describePlan(input.floor, name, null, null)}
      className={cn(
        'w-full overflow-hidden bg-surface-2',
        fill ? 'h-full' : cn('rounded-lg', mapAspectClass(input.floor.bounds ?? EMPTY_BOUNDS)),
        className,
      )}
      onLayout={onLayout}
    >
      {size === null ? null : (
        <IsoStillCanvas input={input} width={size.width} height={size.height} />
      )}
    </View>
  );
}
