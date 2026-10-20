import { TANK_BODY, tankEdge, type SupplyStanding } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { ClipPath, Defs as SvgDefs, G, Line, Path, Pattern } from 'react-native-svg';
import { useUniwind } from 'uniwind';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { useColour } from '../../../design/colour';
import { loopStyle, sway } from '../../../design/loops';
import {
  Layer,
  questionPath,
  rounded,
  scaled,
  useSvgId,
  type SupplyLive,
} from '../../../features/device-visuals';
import { supplyCopy } from '../model/supply-copy';

export const TANK_WIDTH = 64;
export const TANK_HEIGHT = 120;
const INSET = 6;
const TOP = 4;
const RADIUS = 12;
const WAVE_HEIGHT = 10;
const WASTE_COLOUR = '#7a7468';
const WAVE_PATH = 'M0 5 Q5 1 10 5 T20 5 T30 5 T40 5 T50 5 T60 5 T70 5 T80 5 V10 H0 Z';

export interface SupplyTankProps {
  readonly supply: SupplyLive;
  readonly height?: number;
  readonly running?: boolean;
  readonly compact?: boolean;
}

const STANDING_TONE: Readonly<Record<SupplyStanding, Tone>> = {
  ok: 'default',
  low: 'warning',
  out: 'critical',
  unknown: 'variant',
};

interface Geometry {
  readonly body: number;
  readonly inner: number;
  readonly fill: number;
  readonly surface: number;
  readonly lowY: number;
}

function geometryOf(supply: SupplyLive, height: number): Geometry {
  const body = height - TOP - 6;
  const level = supply.level === null ? 0 : Math.max(0, Math.min(1, supply.level / 100));
  const fill = (body - 4) * level;
  return {
    body,
    inner: TANK_WIDTH - INSET * 2,
    fill,
    surface: body - 2 - fill,
    lowY: TOP + 2 + (body - 4) * (1 - supply.detail.threshold / 100),
  };
}

function Meniscus({
  colour,
  geometry,
  running,
}: {
  readonly colour: string;
  readonly geometry: Geometry;
  readonly running: boolean;
}): ReactNode {
  const { inner, body, surface } = geometry;
  const motion = loopStyle({ name: sway(scaled(inner, 100)), ms: 4200 }, running);
  return (
    <Layer
      box={{ x: INSET, y: TOP, w: inner, h: body }}
      px={100}
      look={{ overflow: 'hidden', borderRadius: RADIUS }}
    >
      <Layer
        box={{ x: 0, y: surface - WAVE_HEIGHT / 2, w: inner * 2, h: WAVE_HEIGHT }}
        px={100}
        motion={motion}
      >
        <Svg width={inner * 2} height={WAVE_HEIGHT} viewBox="0 0 80 10" preserveAspectRatio="none">
          <Path d={WAVE_PATH} fill={colour} fillOpacity={0.5} />
        </Svg>
      </Layer>
    </Layer>
  );
}

function Liquid({
  colour,
  edge,
  geometry,
}: {
  readonly colour: string;
  readonly edge: string;
  readonly geometry: Geometry;
}): ReactNode {
  const { inner, body, fill, surface } = geometry;
  return (
    <>
      <Path
        d={rounded({ x: INSET, y: TOP + surface, w: inner, h: fill + 2, r: 0 })}
        fill={colour}
      />
      <Path d={rounded({ x: INSET, y: TOP + surface, w: inner, h: 2.4, r: 0 })} fill={edge} />
      <Path
        d={rounded({ x: INSET + 5, y: TOP + 8, w: 4, h: Math.max(0, body - 16), r: 2 })}
        fill="#ffffff"
        fillOpacity={0.16}
      />
    </>
  );
}

function VesselDefs({
  id,
  shape,
  faint,
}: {
  readonly id: string;
  readonly shape: string;
  readonly faint: string;
}): ReactNode {
  return (
    <SvgDefs>
      <ClipPath id={`${id}c`}>
        <Path d={shape} />
      </ClipPath>
      <Pattern
        id={`${id}h`}
        width={6}
        height={6}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <Line x1={0} y1={0} x2={0} y2={6} stroke={faint} strokeWidth={1.4} />
      </Pattern>
    </SvgDefs>
  );
}

function Mark({
  supply,
  geometry,
}: {
  readonly supply: SupplyLive;
  readonly geometry: Geometry;
}): ReactNode {
  const faint = useColour('on-surface-faint');
  const hot = useColour('critical');
  if (supply.level === null) {
    return (
      <Path
        d={questionPath(TANK_WIDTH / 2, TOP + geometry.body / 2, 9)}
        fill="none"
        stroke={faint}
        strokeWidth={3}
        strokeLinecap="round"
      />
    );
  }
  return (
    <Line
      x1={INSET - 3}
      y1={geometry.lowY}
      x2={TANK_WIDTH - INSET + 3}
      y2={geometry.lowY}
      stroke={supply.standing === 'ok' ? faint : hot}
      strokeWidth={1.4}
      strokeDasharray="3 3"
    />
  );
}

function Vessel({
  supply,
  height,
  running,
}: {
  readonly supply: SupplyLive;
  readonly height: number;
  readonly running: boolean;
}): ReactNode {
  const theme = useUniwind().theme === 'light' ? 'light' : 'dark';
  const id = useSvgId('tank');
  const faint = useColour('on-surface-faint');
  const geometry = geometryOf(supply, height);
  const colour = supply.detail.consumed ? supply.detail.colour : WASTE_COLOUR;
  const edge = tankEdge(colour, theme);
  const shape = rounded({ x: INSET, y: TOP, w: geometry.inner, h: geometry.body, r: RADIUS });
  const label = supplyCopy(supply.detail, supply.level, supply.standing).aria;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={TANK_WIDTH} height={height}>
        <VesselDefs id={id} shape={shape} faint={faint} />
        <Path d={shape} fill={TANK_BODY[theme]} />
        <G clipPath={`url(#${id}c)`}>
          {supply.level === null ? (
            <Path d={shape} fill={`url(#${id}h)`} />
          ) : (
            <Liquid colour={colour} edge={edge} geometry={geometry} />
          )}
        </G>
        <Path d={shape} fill="none" stroke={tankEdge(TANK_BODY[theme], theme)} strokeWidth={1.2} />
        <Mark supply={supply} geometry={geometry} />
      </Svg>
      {supply.level !== null && geometry.fill > 6 ? (
        <Meniscus colour={edge} geometry={geometry} running={running} />
      ) : null}
    </View>
  );
}

export function SupplyTank({
  supply,
  height = TANK_HEIGHT,
  running = false,
  compact = false,
}: SupplyTankProps): ReactNode {
  const copy = supplyCopy(supply.detail, supply.level, supply.standing);
  return (
    <View className="w-20 items-center gap-1">
      <Vessel supply={supply} height={height} running={running} />
      <Text variant="body-strong" tone={STANDING_TONE[supply.standing]} className="tabular">
        {copy.value}
      </Text>
      <Text variant="caption" tone="variant" numberOfLines={compact ? 1 : 2} align="center">
        {compact ? copy.code : copy.name}
      </Text>
      {compact ? null : (
        <Text variant="caption" tone="faint" align="center" numberOfLines={2}>
          {copy.caption}
        </Text>
      )}
    </View>
  );
}
