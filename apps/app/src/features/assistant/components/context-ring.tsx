import type { ReactNode } from 'react';
import Svg, { Circle } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { CONTEXT_WARNS_AT } from '../model/chat-subline';

const STROKE = 2;

export function ContextRing({
  percent,
  size = 14,
}: {
  readonly percent: number;
  readonly size?: number;
}): ReactNode {
  const track = useColour('outline');
  const calm = useColour('primary');
  const warn = useColour('warning');
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  const centre = size / 2;
  return (
    <Svg width={size} height={size} aria-hidden>
      <Circle cx={centre} cy={centre} r={radius} fill="none" stroke={track} strokeWidth={STROKE} />
      <Circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke={percent >= CONTEXT_WARNS_AT ? warn : calm}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${String(filled)} ${String(circumference)}`}
        transform={`rotate(-90 ${String(centre)} ${String(centre)})`}
      />
    </Svg>
  );
}
