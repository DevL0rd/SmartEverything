import type { ReactNode } from 'react';
import { Circle, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { decimal } from '../../../format/number';
import { BREATHE, GLOW, loopStyle } from '../../../design/loops';
import { Canvas, FULL, Layer, useSvgId } from '../parts/frame';
import { BodyGradient, GlowGradient, useInk, type VisualInk, WELL } from '../parts/ink';
import { ContactShadow, Shine } from '../parts/material';
import { DIAL_FIGURES, Readout } from '../parts/readout';
import { arcPath, rounded } from '../parts/shapes';
import type { ThermalMode, VisualProps } from '../types';

const MODE_ROLE: Readonly<Record<ThermalMode, ColourRole>> = {
  heat: 'temp-warm',
  cool: 'temp-cool',
  idle: 'on-surface-faint',
};

function useModeColour(visual: VisualProps): string {
  return useColour(visual.tone === 'active' ? MODE_ROLE[visual.state.thermal] : 'on-surface-faint');
}

function Glow({
  visual,
  cy,
  r,
}: {
  readonly visual: VisualProps;
  readonly cy: number;
  readonly r: number;
}): ReactNode {
  const id = useSvgId('heat');
  const colour = useModeColour(visual);
  if (visual.tone !== 'active' || visual.state.thermal === 'idle') {
    return null;
  }
  return (
    <Layer
      box={FULL}
      px={visual.px}
      motion={loopStyle(
        { name: GLOW, ms: 2800, easing: 'ease-in-out', alternate: true },
        visual.moving,
      )}
    >
      <Canvas px={visual.px}>
        <GlowGradient id={id} colour={colour} strength={0.5} />
        <Circle cx={50} cy={cy} r={r} fill={`url(#${id})`} />
      </Canvas>
    </Layer>
  );
}

function Shadow({ cy, rx }: { readonly cy: number; readonly rx: number }): ReactNode {
  return <ContactShadow cx={50} cy={cy} rx={rx + 4} ry={5} />;
}

function Radiator({ ink, tint }: { readonly ink: VisualInk; readonly tint: string }): ReactNode {
  const body = useSvgId('radiator');
  return (
    <>
      <BodyGradient id={body} ink={ink} vertical />
      <Shadow cy={88} rx={30} />
      <Path
        d={rounded({ x: 22, y: 22, w: 56, h: 60, r: 10 })}
        fill={`url(#${body})`}
        stroke={ink.edge}
        strokeWidth={0.6}
      />
      <Shine d={rounded({ x: 22, y: 22, w: 56, h: 60, r: 10 })} />
      <Path
        d="M32 32 V72 M41 32 V72 M50 32 V72 M59 32 V72 M68 32 V72"
        stroke={ink.well}
        strokeOpacity={WELL}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Path d={rounded({ x: 28, y: 82, w: 8, h: 4, r: 2 })} fill={ink.light} />
      <Path d={rounded({ x: 64, y: 82, w: 8, h: 4, r: 2 })} fill={ink.light} />
      <Circle cx={71} cy={27} r={1.4} fill={tint} />
    </>
  );
}

export function HeaterVisual(props: VisualProps): ReactNode {
  const ink = useInk();
  const tint = useModeColour(props);
  return (
    <>
      <Glow visual={props} cy={52} r={48} />
      <Canvas px={props.px} layer>
        <Radiator ink={ink} tint={tint} />
      </Canvas>
    </>
  );
}

function Airflow({ visual }: { readonly visual: VisualProps }): ReactNode {
  const colour = useModeColour(visual);
  if (visual.tone !== 'active') {
    return null;
  }
  return (
    <Layer
      box={FULL}
      px={visual.px}
      motion={loopStyle(
        { name: BREATHE, ms: 1800, easing: 'ease-in-out', alternate: true },
        visual.moving,
      )}
    >
      <Canvas px={visual.px}>
        <Path
          d="M30 62 Q26 72 32 82 M50 62 Q46 74 52 86 M70 62 Q66 72 72 82"
          stroke={colour}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      </Canvas>
    </Layer>
  );
}

export function AirConditionerVisual(props: VisualProps): ReactNode {
  const ink = useInk();
  const body = useSvgId('ac');
  const tint = useModeColour(props);
  return (
    <>
      <Canvas px={props.px}>
        <BodyGradient id={body} ink={ink} vertical />
        <Path
          d={rounded({ x: 10, y: 26, w: 80, h: 32, r: 10 })}
          fill={`url(#${body})`}
          stroke={ink.edge}
          strokeWidth={0.6}
        />
        <Shine d={rounded({ x: 10, y: 26, w: 80, h: 32, r: 10 })} />
        <Path
          d="M18 52 H82"
          stroke={ink.well}
          strokeOpacity={WELL}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <Circle cx={80} cy={34} r={1.4} fill={tint} />
      </Canvas>
      <Airflow visual={props} />
    </>
  );
}

export function ThermostatVisual(props: VisualProps): ReactNode {
  const ink = useInk();
  const tint = useModeColour(props);
  const { current, targetShare } = props.state;
  return (
    <>
      <Glow visual={props} cy={50} r={50} />
      <Canvas px={props.px} layer>
        <Circle cx={50} cy={50} r={40} fill={ink.light} stroke={ink.edge} strokeWidth={0.6} />
        <Path
          d={arcPath({ cx: 50, cy: 50, r: 33 }, -135, 135)}
          stroke={ink.well}
          strokeOpacity={WELL}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
        />
        {targetShare === null ? null : (
          <Path
            d={arcPath({ cx: 50, cy: 50, r: 33 }, -135, -135 + Math.max(1, targetShare * 270))}
            stroke={tint}
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
          />
        )}
      </Canvas>
      {current === null ? null : (
        <Readout
          box={{ x: 25, y: 25, w: 50, h: 50 }}
          px={props.px}
          size={props.size}
          tone={props.tone}
          figures={DIAL_FIGURES}
          value={`${decimal(current, 0)}°`}
          unit={null}
        />
      )}
    </>
  );
}
