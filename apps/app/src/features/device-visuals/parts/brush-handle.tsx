import type { ReactNode } from 'react';
import { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { wearRole } from '../model/toothbrush-look';
import { useSvgId, type Box } from './frame';
import { BodyGradient, FIXED_INK, useInk, type VisualInk } from './ink';
import { Shine } from './material';
import { rounded } from './shapes';

export const HEAD: Box = { x: 39, y: 3, w: 22, h: 27 };
export const NECK: Box = { x: 45, y: 29, w: 10, h: 13 };
export const BODY: Box = { x: 39, y: 40, w: 22, h: 54 };
export const RING_CENTRE = { x: 50, y: 35 } as const;
export const RING_RADIUS = 10.5;
export const BRISTLE_FIELD: Box = { x: 41, y: 6, w: 18, h: 19 };
export const BRISTLE_XS: readonly number[] = [43.5, 47, 50.5, 54, 57.5];
export const BUTTON = { x: 50, y: 60 } as const;
export const CELL: Box = { x: 44, y: 70, w: 12, h: 18 };

const HEAD_PATH = rounded({ ...HEAD, r: 10 });
const NECK_PATH = rounded({ ...NECK, r: 3 });
const BODY_PATH = rounded({ ...BODY, r: 10 });
const CELL_PATH = rounded({ ...CELL, r: 3 });

export function Chassis({
  ink,
  headRole,
  hasHead,
}: {
  readonly ink: VisualInk;
  readonly headRole: ColourRole;
  readonly hasHead: boolean;
}): ReactNode {
  const pearl = useSvgId('pearl');
  const chrome = useSvgId('chrome');
  const head = useColour(headRole);
  return (
    <>
      <BodyGradient id={pearl} ink={ink} />
      <BodyGradient id={chrome} ink={ink} vertical />
      <Path d={NECK_PATH} fill={`url(#${chrome})`} stroke={ink.edge} strokeWidth={0.8} />
      <Path d={BODY_PATH} fill={`url(#${pearl})`} stroke={ink.edge} strokeWidth={1} />
      <Shine d={BODY_PATH} gloss />
      {hasHead ? (
        <Path d={HEAD_PATH} fill={head} fillOpacity={0.9} stroke={ink.edge} strokeWidth={0.8} />
      ) : (
        <Path
          d={HEAD_PATH}
          fill="none"
          stroke={ink.faint}
          strokeWidth={1}
          strokeDasharray="3 2.4"
        />
      )}
    </>
  );
}

export function Bristles({ ink }: { readonly ink: VisualInk }): ReactNode {
  return (
    <>
      {BRISTLE_XS.map((x) => (
        <Line
          key={x}
          x1={x}
          y1={BRISTLE_FIELD.y}
          x2={x}
          y2={BRISTLE_FIELD.y + BRISTLE_FIELD.h}
          stroke={ink.sheen}
          strokeOpacity={0.85}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      ))}
    </>
  );
}

export function WearRing({ wear }: { readonly wear: number }): ReactNode {
  const colour = useColour(wearRole(wear));
  const track = useColour('outline');
  const circumference = 2 * Math.PI * RING_RADIUS;
  return (
    <>
      <Circle
        cx={RING_CENTRE.x}
        cy={RING_CENTRE.y}
        r={RING_RADIUS}
        fill="none"
        stroke={track}
        strokeWidth={1.4}
      />
      <Circle
        cx={RING_CENTRE.x}
        cy={RING_CENTRE.y}
        r={RING_RADIUS}
        fill="none"
        stroke={colour}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeDasharray={`${String(circumference * Math.min(1, wear))} ${String(circumference)}`}
        transform={`rotate(-90 ${String(RING_CENTRE.x)} ${String(RING_CENTRE.y)})`}
      />
    </>
  );
}

export function Halo({ role }: { readonly role: ColourRole }): ReactNode {
  const colour = useColour(role);
  return (
    <Circle
      cx={50}
      cy={20}
      r={20}
      fill="none"
      stroke={colour}
      strokeOpacity={0.55}
      strokeWidth={3}
    />
  );
}

export function Controls(): ReactNode {
  const ink = useInk();
  return (
    <Circle
      cx={BUTTON.x}
      cy={BUTTON.y}
      r={3.4}
      fill={ink.dark}
      stroke={ink.edge}
      strokeWidth={0.8}
    />
  );
}

export function ChargeCell({
  level,
  charging,
}: {
  readonly level: number;
  readonly charging: boolean;
}): ReactNode {
  const ink = useInk();
  const fill = useColour(level <= 0.2 ? 'critical' : 'positive');
  const height = Math.max(0, Math.min(1, level)) * (CELL.h - 2);
  return (
    <>
      <Path d={CELL_PATH} fill="none" stroke={charging ? fill : ink.faint} strokeWidth={0.9} />
      <G transform={`translate(${String(CELL.x + 1)} ${String(CELL.y + CELL.h - 1 - height)})`}>
        <Rect width={CELL.w - 2} height={height} rx={2} fill={fill} fillOpacity={0.85} />
      </G>
    </>
  );
}

export function FaultMark(): ReactNode {
  const warning = useColour('warning');
  return (
    <>
      <Path d="M50 50 58 64H42Z" fill={warning} stroke={FIXED_INK.lcd} strokeWidth={0.8} />
      <Path d="M50 54v5M50 61v.4" stroke={FIXED_INK.lcd} strokeWidth={1.4} strokeLinecap="round" />
    </>
  );
}
