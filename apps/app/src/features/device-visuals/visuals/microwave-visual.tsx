import type { ReactNode } from 'react';
import { Circle, Defs, Path } from 'react-native-svg';
import { SPIN, loopStyle } from '../../../design/loops';
import { Canvas, FULL, Layer, Squash, useSvgId } from '../parts/frame';
import { BodyGradient, useInk, useTint, type VisualInk } from '../parts/ink';
import { ContactShadow, Shine } from '../parts/material';
import { rounded } from '../parts/shapes';
import type { VisualProps } from '../types';
const BODY = rounded({ x: 6, y: 29, w: 88, h: 47, r: 5 });
const DOOR = rounded({ x: 10, y: 33, w: 64, h: 39, r: 3 });
const TURN = { name: SPIN, ms: 6000 } as const;
function MicrowaveBody({
  ink,
  tint,
  running,
}: {
  readonly ink: VisualInk;
  readonly tint: string;
  readonly running: boolean;
}): ReactNode {
  const body = useSvgId('microwave-body');
  return (
    <>
      <Defs>
        <BodyGradient id={body} ink={ink} />
      </Defs>
      <ContactShadow cx={50} cy={80} rx={42} ry={4} />
      <Path d={BODY} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.6} />
      <Shine d={BODY} />
      <Path d={DOOR} fill={ink.well} fillOpacity={0.86} stroke={ink.edge} strokeWidth={0.5} />
      <Path
        d={rounded({ x: 14, y: 37, w: 50, h: 31, r: 2 })}
        fill={running ? tint : ink.dark}
        fillOpacity={running ? 0.25 : 0.15}
      />
      <Path d="M67 38V67" stroke={ink.light} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M15 37L56 37L15 63Z" fill={ink.sheen} fillOpacity={0.07} />
      <Path d={rounded({ x: 79, y: 37, w: 10, h: 6, r: 1 })} fill={ink.well} fillOpacity={0.8} />
      <Path d="M81 40H87" stroke={tint} strokeWidth={0.7} />
      <Circle cx={84} cy={53} r={4} fill={ink.dark} stroke={ink.edge} strokeWidth={0.8} />
      <Path d="M84 50V52" stroke={ink.ink} strokeWidth={0.7} />
      <Path d="M81 64H87M81 67H87" stroke={ink.faint} strokeWidth={0.7} />
      <Path d="M14 77V79M84 77V79" stroke={ink.edge} strokeWidth={2} />
    </>
  );
}
export function MicrowaveVisual({ state, px, tone, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const tint = useTint('temp-warm', tone);
  const running = state.power === 'on' && state.online;
  return (
    <>
      <Layer box={FULL} px={px}>
        <Canvas px={px}>
          <MicrowaveBody ink={ink} tint={tint} running={running} />
        </Canvas>
      </Layer>
      <Squash box={{ x: 17, y: 40, w: 42, h: 42 }} px={px} ratio={0.25}>
        <Layer box={FULL} px={px * 0.42} motion={loopStyle(TURN, moving && running)}>
          <Canvas px={px * 0.42}>
            <Circle
              cx={50}
              cy={50}
              r={44}
              fill={ink.light}
              fillOpacity={0.16}
              stroke={running ? tint : ink.faint}
              strokeWidth={1.2}
            />
            <Path
              d="M50 12V88M12 50H88"
              stroke={running ? tint : ink.faint}
              strokeOpacity={0.4}
              strokeWidth={1.3}
            />
          </Canvas>
        </Layer>
      </Squash>
    </>
  );
}
