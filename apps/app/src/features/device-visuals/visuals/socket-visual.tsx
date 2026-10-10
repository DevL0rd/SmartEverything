import type { ReactNode } from 'react';
import { Circle, Defs, Path } from 'react-native-svg';
import { Canvas, FULL, Layer, useSvgId } from '../parts/frame';
import { BodyGradient, GlowGradient, useInk, useTint, type VisualInk, WELL } from '../parts/ink';
import { arcPath, rounded } from '../parts/shapes';
import { ContactShadow, Shine } from '../parts/material';
import type { VisualProps } from '../types';

function Outlet({
  ink,
  tint,
  lit,
}: {
  readonly ink: VisualInk;
  readonly tint: string;
  readonly lit: boolean;
}): ReactNode {
  return (
    <>
      <Circle
        cx={50}
        cy={50}
        r={19}
        fill={ink.well}
        fillOpacity={WELL}
        stroke={lit ? tint : ink.edge}
        strokeWidth={lit ? 1.2 : 0.5}
      />
      <Path d={rounded({ x: 41, y: 44, w: 4.5, h: 12, r: 2.25 })} fill={ink.faint} />
      <Path d={rounded({ x: 54.5, y: 44, w: 4.5, h: 12, r: 2.25 })} fill={ink.faint} />
    </>
  );
}

function Rocker({
  ink,
  tint,
  lit,
}: {
  readonly ink: VisualInk;
  readonly tint: string;
  readonly lit: boolean;
}): ReactNode {
  return (
    <>
      <Path d={rounded({ x: 37, y: 30, w: 26, h: 40, r: 9 })} fill={ink.well} fillOpacity={WELL} />
      <Path
        d={rounded({ x: 39.5, y: lit ? 32.5 : 50, w: 21, h: 17.5, r: 7 })}
        fill={lit ? tint : ink.light}
        fillOpacity={lit ? 0.85 : 1}
      />
    </>
  );
}

function Socket({
  visual,
  rocker,
}: {
  readonly visual: VisualProps;
  readonly rocker: boolean;
}): ReactNode {
  const ink = useInk();
  const face = useSvgId('socket');
  const glow = useSvgId('socketGlow');
  const tint = useTint('primary', visual.tone);
  const lit = visual.tone === 'active';
  const { load } = visual.state;
  return (
    <Layer box={FULL} px={visual.px}>
      <Canvas px={visual.px}>
        <Defs>
          <BodyGradient id={face} ink={ink} vertical />
          <GlowGradient id={glow} colour={tint} strength={0.4} />
        </Defs>
        {lit ? <Circle cx={50} cy={50} r={50} fill={`url(#${glow})`} /> : null}
        <ContactShadow cx={50} cy={55} rx={40} ry={38} />
        <Path
          d={rounded({ x: 20, y: 20, w: 60, h: 60, r: 17 })}
          fill={`url(#${face})`}
          stroke={ink.edge}
          strokeWidth={0.6}
        />
        <Shine d={rounded({ x: 20, y: 20, w: 60, h: 60, r: 17 })} />
        {rocker ? (
          <Rocker ink={ink} tint={tint} lit={lit} />
        ) : (
          <Outlet ink={ink} tint={tint} lit={lit} />
        )}
        {load === null || !lit ? null : (
          <Path
            d={arcPath({ cx: 50, cy: 50, r: 26 }, -135, -135 + Math.max(2, load * 270))}
            stroke={tint}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        )}
      </Canvas>
    </Layer>
  );
}

export function PlugVisual(props: VisualProps): ReactNode {
  return <Socket visual={props} rocker={false} />;
}

export function SwitchVisual(props: VisualProps): ReactNode {
  return <Socket visual={props} rocker />;
}
