import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { Circle, Defs, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { eased } from '../../../design/loops';
import { Canvas, FULL, Layer, boxStyle, scaled, useSvgId, type Box } from '../parts/frame';
import { BodyGradient, tintRole, useInk, WELL } from '../parts/ink';
import { rounded } from '../parts/shapes';
import { ContactShadow, Shine } from '../parts/material';
import type { VisualProps } from '../types';

const BOLT: Box = { x: 62, y: 46, w: 24, h: 10 };
const RETRACT = 16;

function Bolt({
  px,
  locked,
  reduced,
}: {
  readonly px: number;
  readonly locked: boolean;
  readonly reduced: boolean;
}): ReactNode {
  const ink = useInk();
  const frame: ViewStyle = {
    ...boxStyle(BOLT, px),
    borderRadius: scaled(2.5, px),
    backgroundColor: ink.ink,
    transform: [{ translateX: locked ? 0 : -scaled(RETRACT, px) }],
  };
  return <Animated.View pointerEvents="none" style={[frame, eased('transform', reduced)]} />;
}

function statusRole(locked: boolean | null): ColourRole {
  if (locked === null) {
    return 'on-surface-faint';
  }
  return locked ? 'positive' : 'warning';
}

export function LockVisual({ state, px, tone, reduced }: VisualProps): ReactNode {
  const ink = useInk();
  const body = useSvgId('lock');
  const locked = state.locked === true;
  const status = useColour(tintRole(statusRole(state.locked), tone));
  return (
    <>
      <Bolt px={px} locked={locked} reduced={reduced} />
      <Layer box={FULL} px={px}>
        <Canvas px={px}>
          <Defs>
            <BodyGradient id={body} ink={ink} />
          </Defs>
          <ContactShadow cx={50} cy={90} rx={22} ry={3.5} />
          <Path
            d={rounded({ x: 30, y: 12, w: 40, h: 76, r: 14 })}
            fill={`url(#${body})`}
            stroke={ink.edge}
            strokeWidth={0.6}
          />
          <Shine d={rounded({ x: 30, y: 12, w: 40, h: 76, r: 14 })} />
          <Circle
            cx={50}
            cy={32}
            r={8}
            fill={ink.well}
            fillOpacity={WELL}
            stroke={status}
            strokeWidth={1.6}
          />
          <Path
            d="M50 56 V72"
            stroke={ink.well}
            strokeOpacity={WELL}
            strokeWidth={5}
            strokeLinecap="round"
          />
          <Circle cx={50} cy={53} r={4.5} fill={ink.well} fillOpacity={WELL} />
        </Canvas>
      </Layer>
    </>
  );
}
