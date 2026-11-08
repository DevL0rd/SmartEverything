import { useId, type ReactNode } from 'react';
import { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import type { VacuumFinish } from '@smarteverything/domain';
import { VACUUM_FINISH_PAINT as FINISHES, rounded } from '../../../device-visuals';

const BUMPER_DEGREES = 62;

const TURRET_FORWARD = 0.17;

const TANK_CLEAN = '#5aa2ee';

const TANK_DIRTY = '#a89c84';

function f(value: number): string {
  return value.toFixed(2);
}

function bumperPath(radius: number): string {
  const angle = (BUMPER_DEGREES * Math.PI) / 180;
  const x = radius * Math.cos(angle);
  const y = radius * Math.sin(angle);
  return `M${f(x)} ${f(-y)} A${f(radius)} ${f(radius)} 0 0 1 ${f(x)} ${f(y)}`;
}

export function RobotPin({
  r,
  rotation,
  ring,
  finish,
}: {
  readonly r: number;
  readonly rotation: number;
  readonly ring: string;
  readonly finish: VacuumFinish;
}): ReactNode {
  const id = `vp${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const turret = { cx: r * TURRET_FORWARD, cy: 0 };
  const pin = FINISHES[finish];
  return (
    <>
      <Defs>
        <RadialGradient id={id} cx="0.38" cy="0.32" r="0.8">
          <Stop offset="0" stopColor={pin.body[0]} />
          <Stop offset="0.65" stopColor={pin.body[1]} />
          <Stop offset="1" stopColor={pin.body[2]} />
        </RadialGradient>
      </Defs>
      <Circle cy={r * 0.14} r={r * 1.05} fill="#000000" fillOpacity={0.3} />
      <Circle r={r} fill={`url(#${id})`} stroke={pin.edge} strokeWidth={0.7} />
      <G transform={`rotate(${f(rotation)})`}>
        <Path
          d={bumperPath(r * 0.86)}
          fill="none"
          stroke={pin.bumper}
          strokeWidth={Math.max(1.4, r * 0.24)}
        />
        <Circle
          {...turret}
          r={r * 0.36}
          fill="#2a2d36"
          stroke={ring}
          strokeWidth={Math.max(0.8, r * 0.08)}
        />
        <Circle {...turret} r={r * 0.2} fill="#4a4f5e" />
      </G>
    </>
  );
}

export function DockPin({
  size,
  finish,
  ramp,
}: {
  readonly size: number;
  readonly finish: VacuumFinish;
  readonly ramp: string;
}): ReactNode {
  const tank = size * 0.26;
  const paint = FINISHES[finish];
  return (
    <>
      <Path
        d={rounded({
          x: -size * 0.08,
          y: -size * 0.34,
          w: size * 0.62,
          h: size * 0.68,
          r: size * 0.1,
        })}
        fill={ramp}
        fillOpacity={0.55}
      />
      <Path
        d={rounded({
          x: -size * 0.52,
          y: -size * 0.4,
          w: size * 0.5,
          h: size * 0.8,
          r: size * 0.12,
        })}
        fill={paint.station}
        stroke={paint.edge}
        strokeOpacity={0.8}
        strokeWidth={0.6}
      />
      <Path
        d={rounded({ x: -size * 0.4, y: -size * 0.3, w: tank, h: tank, r: size * 0.05 })}
        fill={TANK_CLEAN}
      />
      <Path
        d={rounded({ x: -size * 0.4, y: size * 0.04, w: tank, h: tank, r: size * 0.05 })}
        fill={TANK_DIRTY}
      />
    </>
  );
}
