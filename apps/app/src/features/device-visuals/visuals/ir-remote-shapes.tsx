import type { ReactNode } from 'react';
import { Circle, Ellipse, Path } from 'react-native-svg';
import { type VisualInk } from '../parts/ink';
import { bladesPath, rounded } from '../parts/shapes';
import type { IrCategory } from '../model/ir-category';

export interface ShapeProps {
  readonly ink: VisualInk;
  readonly body: string;
  readonly tint: string;
  readonly on: boolean;
  readonly dash: string | undefined;
}

const EDGE = 0.9;
const WAVE_COUNT = 3;

function Body({ d, ink, body, tint, on, dash }: ShapeProps & { readonly d: string }): ReactNode {
  return (
    <Path
      d={d}
      fill={`url(#${body})`}
      stroke={on ? tint : ink.edge}
      strokeWidth={on ? 1.6 : EDGE}
      {...(dash === undefined ? {} : { strokeDasharray: dash })}
    />
  );
}

function Led({
  tint,
  on,
  ink,
  x,
  y,
}: ShapeProps & { readonly x: number; readonly y: number }): ReactNode {
  return <Circle cx={x} cy={y} r={2.2} fill={on ? tint : ink.faint} />;
}

function Ac(props: ShapeProps): ReactNode {
  const { ink, tint, on } = props;
  return (
    <>
      <Body {...props} d={rounded({ x: 6, y: 22, w: 88, h: 34, r: 11 })} />
      <Path d={rounded({ x: 14, y: 42, w: 72, h: 5, r: 2.5 })} fill={ink.well} fillOpacity={0.7} />
      <Led {...props} x={80} y={32} />
      {on
        ? Array.from({ length: WAVE_COUNT }, (_, index) => (
            <Path
              key={index}
              d={`M${String(28 + index * 22)} 62 q5 7 0 15`}
              stroke={tint}
              strokeWidth={2}
              strokeLinecap="round"
              strokeOpacity={0.7 - index * 0.15}
              fill="none"
            />
          ))
        : null}
    </>
  );
}

function Fan(props: ShapeProps): ReactNode {
  const { ink, tint, on } = props;
  return (
    <>
      <Ellipse
        cx={50}
        cy={86}
        rx={20}
        ry={4}
        fill={ink.dark}
        stroke={ink.edge}
        strokeWidth={EDGE}
      />
      <Path
        d={rounded({ x: 46, y: 62, w: 8, h: 24, r: 3 })}
        fill={ink.light}
        stroke={ink.edge}
        strokeWidth={EDGE}
      />
      <Body {...props} d="M50 8 a30 30 0 1 0 0.01 0 Z" />
      <Path d={bladesPath(4, 22, 4)} fill={on ? tint : ink.faint} fillOpacity={on ? 0.85 : 0.5} />
    </>
  );
}

function Light(props: ShapeProps): ReactNode {
  const { ink, tint, on } = props;
  return (
    <>
      {on ? <Circle cx={50} cy={34} r={30} fill={tint} fillOpacity={0.18} /> : null}
      <Ellipse
        cx={50}
        cy={88}
        rx={20}
        ry={4}
        fill={ink.dark}
        stroke={ink.edge}
        strokeWidth={EDGE}
      />
      <Path
        d={rounded({ x: 47, y: 52, w: 6, h: 36, r: 2 })}
        fill={ink.light}
        stroke={ink.edge}
        strokeWidth={EDGE}
      />
      <Body {...props} d="M26 52 L34 14 Q50 8 66 14 L74 52 Z" />
    </>
  );
}

function Speaker(props: ShapeProps): ReactNode {
  const { ink, tint, on } = props;
  return (
    <>
      <Body {...props} d={rounded({ x: 24, y: 8, w: 52, h: 84, r: 13 })} />
      <Circle cx={50} cy={26} r={7} fill={ink.well} fillOpacity={0.6} />
      <Circle
        cx={50}
        cy={64}
        r={17}
        fill={ink.well}
        fillOpacity={0.55}
        stroke={ink.edge}
        strokeWidth={EDGE}
      />
      <Circle cx={50} cy={64} r={6} fill={on ? tint : ink.faint} />
      {on ? (
        <Circle
          cx={50}
          cy={64}
          r={22}
          fill="none"
          stroke={tint}
          strokeOpacity={0.45}
          strokeWidth={1.4}
        />
      ) : null}
    </>
  );
}

function Projector(props: ShapeProps): ReactNode {
  const { ink, tint, on } = props;
  return (
    <>
      {on ? <Path d="M70 46 L98 28 V72 Z" fill={tint} fillOpacity={0.2} /> : null}
      <Body {...props} d={rounded({ x: 6, y: 32, w: 66, h: 36, r: 11 })} />
      <Circle
        cx={56}
        cy={50}
        r={11}
        fill={ink.well}
        fillOpacity={0.6}
        stroke={ink.edge}
        strokeWidth={EDGE}
      />
      <Circle cx={56} cy={50} r={4.5} fill={on ? tint : ink.faint} />
      <Path d={rounded({ x: 14, y: 42, w: 22, h: 4, r: 2 })} fill={ink.well} fillOpacity={0.7} />
    </>
  );
}

function Tv(props: ShapeProps): ReactNode {
  const { ink, tint, on } = props;
  return (
    <>
      <Body {...props} d={rounded({ x: 6, y: 16, w: 88, h: 54, r: 8 })} />
      <Path
        d={rounded({ x: 12, y: 22, w: 76, h: 42, r: 4 })}
        fill={on ? tint : ink.well}
        fillOpacity={on ? 0.32 : 0.7}
      />
      <Path
        d={rounded({ x: 38, y: 74, w: 24, h: 5, r: 2.5 })}
        fill={ink.light}
        stroke={ink.edge}
        strokeWidth={EDGE}
      />
    </>
  );
}

function SetTop(props: ShapeProps): ReactNode {
  const { ink } = props;
  return (
    <>
      <Body {...props} d={rounded({ x: 8, y: 36, w: 84, h: 28, r: 9 })} />
      <Path d={rounded({ x: 16, y: 46, w: 32, h: 5, r: 2.5 })} fill={ink.well} fillOpacity={0.7} />
      <Led {...props} x={80} y={50} />
    </>
  );
}

function Handset(props: ShapeProps): ReactNode {
  const { ink, tint, on } = props;
  return (
    <>
      <Body {...props} d={rounded({ x: 34, y: 6, w: 32, h: 88, r: 13 })} />
      <Circle cx={50} cy={20} r={4.5} fill={on ? tint : ink.faint} />
      {[40, 58, 76].map((cy) =>
        [43, 57].map((cx) => (
          <Circle
            key={`${String(cx)}-${String(cy)}`}
            cx={cx}
            cy={cy}
            r={4}
            fill={ink.light}
            stroke={ink.edge}
            strokeWidth={0.6}
          />
        )),
      )}
    </>
  );
}

export const SHAPES: Readonly<Record<IrCategory, (props: ShapeProps) => ReactNode>> = {
  ac: Ac,
  fan: Fan,
  light: Light,
  speaker: Speaker,
  projector: Projector,
  tv: Tv,
  settop: SetTop,
  other: Handset,
};
