import type { ReactNode } from 'react';
import { useState } from 'react';
import { Circle } from 'react-native-svg';
import { RING, loopStyle } from '../../../design/loops';
import { Canvas, FULL, Layer, useSvgId } from '../parts/frame';
import { BodyGradient, useInk, useTint } from '../parts/ink';
import { DIAL_FIGURES, Readout } from '../parts/readout';
import { ContactShadow, Shine } from '../parts/material';
import { circlePath } from '../parts/shapes';
import type { VisualProps } from '../types';
import { ContactVisual } from './contact-visual';
import { PresenceVisual } from './presence-visual';
import { RadarVisual } from './radar-visual';

function Pulse({
  px,
  colour,
  at,
  running,
}: {
  readonly px: number;
  readonly colour: string;
  readonly at: string;
  readonly running: boolean;
}): ReactNode {
  const [first] = useState(at);
  if (!running || first === at) {
    return null;
  }
  return (
    <Layer
      key={at}
      box={FULL}
      px={px}
      motion={loopStyle({ name: RING, ms: 1100, easing: 'ease-out', times: 1 }, true)}
    >
      <Canvas px={px}>
        <Circle cx={50} cy={50} r={40} fill="none" stroke={colour} strokeWidth={2} />
      </Canvas>
    </Layer>
  );
}

function ReadingSensor({ state, size, px, tone, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const body = useSvgId('puck');
  const tint = useTint('info', tone);
  const { reading } = state;
  return (
    <>
      <Canvas px={px}>
        <BodyGradient id={body} ink={ink} vertical />
        <ContactShadow cx={50} cy={55} rx={46} ry={44} />
        <Circle cx={50} cy={50} r={38} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.6} />
        <Shine d={circlePath({ cx: 50, cy: 50, r: 38 })} />
        <Circle cx={50} cy={50} r={30} fill={ink.light} stroke={ink.edge} strokeWidth={0.4} />
        {size === 'tile' || reading === null ? <Circle cx={50} cy={50} r={6} fill={tint} /> : null}
        <Circle cx={50} cy={78} r={1.4} fill={tint} />
      </Canvas>
      {reading === null ? null : (
        <>
          <Pulse px={px} colour={tint} at={reading.at} running={moving} />
          <Readout
            box={{ x: 20, y: 20, w: 60, h: 60 }}
            px={px}
            size={size}
            tone={tone}
            figures={DIAL_FIGURES}
            value={reading.text}
            unit={reading.unit}
          />
        </>
      )}
    </>
  );
}

export function SensorVisual(props: VisualProps): ReactNode {
  if (props.state.open !== null) {
    return <ContactVisual {...props} />;
  }
  if (props.state.presence === null) {
    return <ReadingSensor {...props} />;
  }
  return props.state.detection === undefined ? (
    <PresenceVisual {...props} />
  ) : (
    <RadarVisual {...props} />
  );
}
