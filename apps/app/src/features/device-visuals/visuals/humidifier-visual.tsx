import type { ReactNode } from 'react';
import { Circle, Defs, Ellipse, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { BLINK, BREATHE, loopStyle } from '../../../design/loops';
import { Canvas, FULL, Layer, useSvgId, type Box } from '../parts/frame';
import { BodyGradient, GlowGradient, useInk, useTint, type VisualInk, WELL } from '../parts/ink';
import { Puffs } from '../parts/particles';
import { Water } from '../parts/water';
import { rounded } from '../parts/shapes';
import { ContactShadow, LIGHT, Shine } from '../parts/material';
import type { VisualProps } from '../types';

const WINDOW: Box = { x: 30, y: 52, w: 40, h: 26 };
const TANK = rounded({ x: 20, y: 36, w: 60, h: 52, r: 16 });
const GLARE = 'M35 57 Q34 64 35 72';
const DROP = 'M50 58 C50 58 44 65 44 69 A6 6 0 0 0 56 69 C56 65 50 58 50 58 Z';

function Tank({
  ink,
  tint,
  low,
}: {
  readonly ink: VisualInk;
  readonly tint: string;
  readonly low: boolean;
}): ReactNode {
  const body = useSvgId('tank');
  const warning = useColour('warning');
  const glass = useColour('humidity');
  return (
    <>
      <Defs>
        <BodyGradient id={body} ink={ink} />
      </Defs>
      <ContactShadow cx={50} cy={90} rx={36} ry={5.5} />
      <Path d={TANK} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.6} />
      <Shine d={TANK} />
      <Path
        d={rounded({ x: 24, y: 30, w: 52, h: 11, r: 5.5 })}
        fill={ink.light}
        stroke={ink.edge}
        strokeWidth={0.6}
      />
      <Shine d={rounded({ x: 24, y: 30, w: 52, h: 11, r: 5.5 })} vertical />
      <Ellipse cx={50} cy={30.5} rx={9} ry={2.6} fill={ink.well} fillOpacity={WELL} />
      <Circle cx={69} cy={35.5} r={1.4} fill={tint} />
      <Path
        d={rounded({ x: WINDOW.x, y: WINDOW.y, w: WINDOW.w, h: WINDOW.h, r: 8 })}
        fill={low ? warning : glass}
        fillOpacity={low ? 0.22 : 0.16}
        stroke={ink.edge}
        strokeWidth={0.4}
      />
    </>
  );
}

function LowWater({ px, running }: { readonly px: number; readonly running: boolean }): ReactNode {
  const warning = useColour('warning');
  return (
    <Layer box={FULL} px={px} motion={loopStyle({ name: BLINK, ms: 700, times: 2 }, running)}>
      <Canvas px={px}>
        <Path d={DROP} fill={warning} />
      </Canvas>
    </Layer>
  );
}

function StillPuff({
  px,
  colour,
  running,
}: {
  readonly px: number;
  readonly colour: string;
  readonly running: boolean;
}): ReactNode {
  const glow = useSvgId('mist');
  return (
    <Layer
      box={FULL}
      px={px}
      motion={loopStyle(
        { name: BREATHE, ms: 2400, easing: 'ease-in-out', alternate: true },
        running,
      )}
    >
      <Canvas px={px}>
        <Defs>
          <GlowGradient id={glow} colour={colour} />
        </Defs>
        <Circle cx={50} cy={18} r={14} fill={`url(#${glow})`} />
      </Canvas>
    </Layer>
  );
}

function Glare({ px }: { readonly px: number }): ReactNode {
  return (
    <Layer box={FULL} px={px}>
      <Canvas px={px}>
        <Path
          d={GLARE}
          stroke={LIGHT}
          strokeOpacity={0.45}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Canvas>
    </Layer>
  );
}

function TankVisual({
  state,
  size,
  px,
  tone,
  moving,
  mist,
}: VisualProps & { readonly mist: boolean }): ReactNode {
  const ink = useInk();
  const tint = useTint('humidity', tone);
  const water = useColour('humidity');
  const misting = mist && tone === 'active';
  const flowing = misting && moving && size !== 'tile';
  return (
    <>
      <Canvas px={px}>
        <Tank ink={ink} tint={tint} low={state.waterLow} />
      </Canvas>
      {state.waterLevel === null ? null : (
        <Water
          box={WINDOW}
          px={px}
          level={state.waterLevel}
          colour={water}
          radius={8}
          running={moving}
        />
      )}
      <Glare px={px} />
      {state.waterLow ? <LowWater px={px} running={moving} /> : null}
      {misting && !flowing ? <StillPuff px={px} colour={tint} running={moving} /> : null}
      {flowing ? (
        <Puffs
          px={px}
          colour={tint}
          emitter={{
            x: 50,
            y: 24,
            spread: 7,
            travel: 22,
            size: 16,
            count: 3,
            ms: 3800 - state.level * 1200,
          }}
        />
      ) : null}
    </>
  );
}

export function HumidifierVisual(props: VisualProps): ReactNode {
  return <TankVisual {...props} mist />;
}

export function DehumidifierVisual(props: VisualProps): ReactNode {
  return <TankVisual {...props} mist={false} />;
}
