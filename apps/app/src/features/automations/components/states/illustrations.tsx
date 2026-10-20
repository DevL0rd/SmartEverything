import type { ReactNode } from 'react';
import Svg, { Circle, G, Line, Rect } from 'react-native-svg';
import { useColour } from '../../../../design/colour';

const FRAME = { width: 220, height: 72 } as const;

function Illustration({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Svg
      width={FRAME.width}
      height={FRAME.height}
      viewBox={`0 0 ${String(FRAME.width)} ${String(FRAME.height)}`}
      accessibilityLabel={label}
      accessible
    >
      {children}
    </Svg>
  );
}

function Box({
  x,
  y,
  ...rect
}: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rx: number;
  readonly fill: string;
  readonly stroke?: string;
  readonly opacity?: number;
}): ReactNode {
  return (
    <G transform={[{ translateX: x }, { translateY: y }]}>
      <Rect {...rect} />
    </G>
  );
}

export function ConnectedCards({ label }: { readonly label: string }): ReactNode {
  const card = useColour('surface-3');
  const edge = useColour('outline-variant');
  const wire = useColour('primary');
  const accents = [useColour('viz-violet'), useColour('viz-blue'), useColour('positive')] as const;
  return (
    <Illustration label={label}>
      <Line x1="64" y1="36" x2="78" y2="36" stroke={wire} strokeWidth={2} />
      <Line x1="142" y1="36" x2="156" y2="36" stroke={wire} strokeWidth={2} />
      {accents.map((accent, index) => (
        <Box
          key={accent + String(index)}
          x={4 + index * 78}
          y={14}
          width={60}
          height={44}
          rx={10}
          fill={card}
          stroke={edge}
        />
      ))}
      {accents.map((accent, index) => (
        <Circle key={accent + String(index)} cx={20 + index * 78} cy={36} r={6} fill={accent} />
      ))}
    </Illustration>
  );
}

export function FrameStrip({ label }: { readonly label: string }): ReactNode {
  const card = useColour('surface-3');
  const edge = useColour('outline-variant');
  const accent = useColour('primary');
  const arrow = useColour('on-surface-faint');
  return (
    <Illustration label={label}>
      <Box x={4} y={10} width={56} height={52} rx={10} fill={card} stroke={edge} />
      <Box x={82} y={10} width={56} height={52} rx={10} fill={card} stroke={accent} />
      <Box x={160} y={10} width={56} height={52} rx={10} fill={card} stroke={edge} />
      <Line x1="62" y1="36" x2="80" y2="36" stroke={arrow} strokeWidth={2} />
      <Line x1="140" y1="36" x2="158" y2="36" stroke={arrow} strokeWidth={2} />
      <Box x={14} y={22} width={36} height={8} rx={4} fill={arrow} />
      <Box x={14} y={42} width={36} height={8} rx={4} fill={arrow} />
      <Box x={92} y={22} width={36} height={28} rx={8} fill={accent} opacity={0.25} />
      <Box x={170} y={30} width={36} height={12} rx={6} fill={accent} />
    </Illustration>
  );
}
