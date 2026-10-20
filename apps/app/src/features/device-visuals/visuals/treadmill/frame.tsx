import { createContext, use, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Path,
  Polygon,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import type { LoopStyle } from '../../../../design/loops';
import { useSvgId } from '../../parts/frame';
import { FLOOR_Y, VIEW, type Point } from './geometry';
import type { Silver } from './palette';
import { Gradient, Slab, type Ramp } from './shapes';

export interface Local {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const ORIGIN: Point = { x: 0, y: 0 };
const Parent = createContext<Point>(ORIGIN);

export function stageHeight(px: number): number {
  return (px * VIEW.h) / VIEW.w;
}

export function Stage({
  px,
  children,
}: {
  readonly px: number;
  readonly children: ReactNode;
}): ReactNode {
  const style: ViewStyle = {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: px,
    height: stageHeight(px),
  };
  return (
    <View pointerEvents="none" style={style}>
      {children}
    </View>
  );
}

export function Part({
  px,
  at,
  box,
  angle = 0,
  motion = null,
  look,
  shape,
  children,
}: {
  readonly px: number;
  readonly at: Point;
  readonly box: Local;
  readonly angle?: number;
  readonly motion?: LoopStyle | null;
  readonly look?: ViewStyle | object;
  readonly shape?: ReactNode;
  readonly children?: ReactNode;
}): ReactNode {
  const parent = use(Parent);
  const s = px / VIEW.w;
  const frame: ViewStyle = {
    position: 'absolute',
    left: (at.x + box.x - parent.x) * s,
    top: (at.y + box.y - parent.y) * s,
    width: box.w * s,
    height: box.h * s,
    transformOrigin: `${String(-box.x * s)}px ${String(-box.y * s)}px`,
    transform: [{ rotate: `${String(angle)}deg` }],
  };
  return (
    <Animated.View pointerEvents="none" style={[frame, look, motion]}>
      {shape === undefined ? null : (
        <Svg
          width={box.w * s}
          height={box.h * s}
          viewBox={`${String(box.x)} ${String(box.y)} ${String(box.w)} ${String(box.h)}`}
        >
          {shape}
        </Svg>
      )}
      <Parent value={{ x: box.x, y: box.y }}>{children}</Parent>
    </Animated.View>
  );
}

export function Tilting({
  px,
  pivot,
  look,
  children,
}: {
  readonly px: number;
  readonly pivot: Point;
  readonly look: object;
  readonly children: ReactNode;
}): ReactNode {
  const s = px / VIEW.w;
  const frame: ViewStyle = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: VIEW.w * s,
    height: VIEW.h * s,
    transformOrigin: `${String(pivot.x * s)}px ${String(pivot.y * s)}px`,
  };
  return (
    <Animated.View pointerEvents="none" style={[frame, look]}>
      {children}
    </Animated.View>
  );
}

export const FULL_STAGE: Local = { x: 0, y: 0, w: VIEW.w, h: VIEW.h };

export function Plane({
  px,
  motion,
  look,
  children,
}: {
  readonly px: number;
  readonly motion?: LoopStyle | null;
  readonly look?: ViewStyle | object;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Part
      px={px}
      at={ORIGIN}
      box={FULL_STAGE}
      shape={children}
      {...(motion === undefined ? {} : { motion })}
      {...(look === undefined ? {} : { look })}
    />
  );
}

const RAMPS = [
  {
    key: 'f',
    vertical: true,
    stops: (s: Silver): Ramp => [
      [0, s.sv1],
      [0.5, s.sv2],
      [1, s.sv3],
    ],
  },
  {
    key: 'd',
    vertical: true,
    stops: (s: Silver): Ramp => [
      [0, s.sv2],
      [1, s.sv4],
    ],
  },
  {
    key: 'p',
    vertical: false,
    stops: (s: Silver): Ramp => [
      [0, s.sv3],
      [0.32, s.sv1],
      [0.62, s.sv2],
      [1, s.sv4],
    ],
  },
  {
    key: 'q',
    vertical: false,
    stops: (s: Silver): Ramp => [
      [0, s.sv4],
      [0.4, s.sv3],
      [1, s.sv5],
    ],
  },
  {
    key: 'c',
    vertical: true,
    stops: (s: Silver): Ramp => [
      [0, s.glass1],
      [1, s.glass2],
    ],
  },
] as const;

export function Metal({ silver, id }: { readonly silver: Silver; readonly id: string }): ReactNode {
  return (
    <Defs>
      {RAMPS.map((ramp) => (
        <Gradient
          key={ramp.key}
          id={`${id}${ramp.key}`}
          stops={ramp.stops(silver)}
          vertical={ramp.vertical}
        />
      ))}
    </Defs>
  );
}

export function Floor({ px }: { readonly px: number }): ReactNode {
  const id = useSvgId('tmfloor');
  return (
    <Plane px={px}>
      <Defs>
        <RadialGradient id={id}>
          <Stop offset="0" stopColor="#000000" stopOpacity={0.5} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={204} cy={FLOOR_Y - 1} rx={178} ry={7} fill={`url(#${id})`} />
    </Plane>
  );
}

export function RearFrame({
  silver,
  id,
}: {
  readonly silver: Silver;
  readonly id: string;
}): ReactNode {
  return (
    <>
      <Metal silver={silver} id={id} />
      <Polygon points="318,316 330,316 294,118 282,118" fill={`url(#${id}q)`} />
      <Slab x={192} y={103} w={76} h={8} r={4} fill={`url(#${id}q)`} />
      <Slab x={192} y={103} w={36} h={8} r={4} fill={silver.sv5} />
      <Slab x={28} y={340} w={24} h={22} r={9} fill={silver.sv5} />
      <Slab x={25} y={311} w={30} h={30} r={8} fill={`url(#${id}f)`} />
      <Path
        d="M29 318a8 8 0 0 1 8-6h12"
        stroke={silver.rim}
        strokeWidth={1.3}
        fill="none"
        strokeLinecap="round"
      />
      <Slab x={40} y={322} w={228} h={19} r={3} fill={`url(#${id}d)`} />
      <Slab x={40} y={322} w={228} h={2.4} fill={silver.rim} />
      <Slab x={44} y={328} w={220} h={3.6} r={1.8} fill={silver.groove} />
      <Slab x={112} y={327} w={30} h={6.4} r={3.2} fill={silver.acc} />
      <Slab x={176} y={327} w={30} h={6.4} r={3.2} fill={silver.acc} />
      <Path
        d="M258 339V326Q258 316 270 314L348 308Q377 306 378 334V356Q378 362 371 362H266Q258 362 258 355Z"
        fill={`url(#${id}f)`}
      />
      <Path
        d="M258 346H378V356Q378 362 371 362H266Q258 362 258 355Z"
        fill={silver.sv4}
        opacity={0.55}
      />
      <Path
        d="M262 322Q264 316 272 315L346 309Q364 308 372 314"
        stroke={silver.rim}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx={366} cy={357} r={5.6} fill={silver.acc} />
      <Circle cx={366} cy={357} r={2.2} fill={silver.sv5} />
      <Circle cx={326} cy={357} r={5.6} fill={silver.acc} />
      <Circle cx={326} cy={357} r={2.2} fill={silver.sv5} />
    </>
  );
}

export function FrontFrame({
  silver,
  id,
  grips,
}: {
  readonly silver: Silver;
  readonly id: string;
  readonly grips: string;
}): ReactNode {
  return (
    <G>
      <Metal silver={silver} id={id} />
      <Polygon points="291.4,332 304.6,332 268.6,118 255.4,118" fill={`url(#${id}p)`} />
      <Path
        d="M292.4 328L258 124"
        stroke={silver.rim}
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={0.8}
      />
      <Circle cx={298} cy={330} r={9} fill={`url(#${id}f)`} stroke={silver.sv5} strokeWidth={1} />
      <Circle cx={298} cy={330} r={4.2} fill={silver.sv5} />
      <Slab x={184} y={106} w={82} h={10} r={5} fill={`url(#${id}p)`} />
      <Slab x={184} y={106} w={42} h={10} r={5} fill={silver.grip} />
      <Slab x={184} y={106} w={42} h={3} r={1.5} fill={silver.rim} opacity={0.5} />
      <Slab x={200} y={115} w={26} h={5.4} r={2.7} fill={grips} />
    </G>
  );
}
