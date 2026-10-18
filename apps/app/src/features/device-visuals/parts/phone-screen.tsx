import type { ReactNode } from 'react';
import { Circle, Path, Text as SvgText } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { PHONE_GLASS } from '../../../design/product-colours';
import { FIXED_INK } from './ink';
import {
  BAR_HEIGHT,
  bandOf,
  centreOf,
  dotCentres,
  fillWidth,
  MOST_DOTS,
  screenBounds,
  type Slab,
} from './phone-geometry';
import { rounded } from './shapes';
import type { PhoneFacts, PhoneRinger, VisualSize } from '../types';

const BOLT = 'M-1.2 3.4L1.6 -0.4H-0.2L0.8 -3.4L-1.8 0.4H0Z';
const HANDSET =
  'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384';
const THERMOMETER = 'M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z';
const BELL = 'M-3.4 1.6a3.4 3.4 0 0 1 6.8 0c0 3.4 1.2 4 1.2 4H-4.6S-3.4 5 -3.4 1.6Z';
const SLASH = 'M-5 -4.4L5 6';
const BUZZ = 'M-5 -2v4M5 -2v4';
const MOON = 'M2.6 3.4a4.2 4.2 0 1 1-5-5.6 3.4 3.4 0 0 0 5 5.6z';
const CLOCK_BAR = { w: 14, h: 1.6 } as const;
const CLOCK_FONT = 7;
const CLOCK_Y_OFFSET = 22;

function Ringer({
  mode,
  x,
  y,
}: {
  readonly mode: PhoneRinger;
  readonly x: number;
  readonly y: number;
}): ReactNode {
  const place = `translate(${String(x)} ${String(y)}) scale(0.8)`;
  if (mode === 'dnd') {
    return <Path d={MOON} transform={place} fill={FIXED_INK.white} fillOpacity={0.95} />;
  }
  return (
    <>
      {mode === 'vibrate' ? (
        <Path
          d={`${BUZZ}M-2.2 -4.6h4.4a1 1 0 0 1 1 1v7.2a1 1 0 0 1-1 1h-4.4a1 1 0 0 1-1-1v-7.2a1 1 0 0 1 1-1Z`}
          transform={place}
          fill="none"
          stroke={FIXED_INK.white}
          strokeWidth={1.3}
          strokeLinecap="round"
        />
      ) : (
        <Path
          d={mode === 'silent' ? `${BELL}${SLASH}` : BELL}
          transform={place}
          fill="none"
          stroke={FIXED_INK.white}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </>
  );
}

function Clock({
  slab,
  top,
  time,
  size,
}: {
  readonly slab: Slab;
  readonly top: number;
  readonly time: string | null;
  readonly size: VisualSize;
}): ReactNode {
  const centre = centreOf(slab);
  if (size === 'hero' && time !== null) {
    return (
      <SvgText
        transform={`translate(${String(centre)} ${String(top + CLOCK_Y_OFFSET)})`}
        textAnchor="middle"
        fontFamily="Geist-SemiBold"
        fontSize={CLOCK_FONT}
        fill={PHONE_GLASS.text}
      >
        {time}
      </SvgText>
    );
  }
  return (
    <Path
      d={rounded({
        x: centre - CLOCK_BAR.w / 2,
        y: top + CLOCK_Y_OFFSET - 3,
        w: CLOCK_BAR.w,
        h: CLOCK_BAR.h,
        r: 0.8,
      })}
      fill={FIXED_INK.white}
      fillOpacity={0.45}
    />
  );
}

function Call({ slab, top }: { readonly slab: Slab; readonly top: number }): ReactNode {
  const positive = useColour('positive');
  const centre = centreOf(slab);
  return (
    <>
      <Circle cx={centre} cy={top + 20} r={8} fill={positive} fillOpacity={0.92} />
      <Path
        d={HANDSET}
        transform={`translate(${String(centre - 5.4)} ${String(top + 14.6)}) scale(0.45)`}
        fill="none"
        stroke={FIXED_INK.white}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function Notifications({
  count,
  slab,
  top,
}: {
  readonly count: number;
  readonly slab: Slab;
  readonly top: number;
}): ReactNode {
  const primary = useColour('primary');
  const centre = centreOf(slab);
  const xs = dotCentres(count, centre, 6.6);
  const last = xs[xs.length - 1];
  return (
    <>
      {xs.map((x) => (
        <Circle key={x} cx={x} cy={top} r={2.1} fill={primary} />
      ))}
      {count > MOST_DOTS && last !== undefined ? (
        <Path
          d={`M${String(last + 5)} ${String(top)}h3.6M${String(last + 6.8)} ${String(top - 1.8)}v3.6`}
          stroke={FIXED_INK.white}
          strokeWidth={1.1}
          strokeLinecap="round"
        />
      ) : null}
    </>
  );
}

function Playing({
  slab,
  top,
  tint,
}: {
  readonly slab: Slab;
  readonly top: number;
  readonly tint: string;
}): ReactNode {
  const { x, w } = screenBounds(slab);
  const track = Math.max(8, w - 26);
  return (
    <>
      <Path
        d={rounded({ x: x + 3, y: top, w: w - 6, h: 12, r: 3.6 })}
        fill={FIXED_INK.white}
        fillOpacity={0.14}
      />
      <Path d={rounded({ x: x + 5, y: top + 1.8, w: 8.4, h: 8.4, r: 2.2 })} fill={tint} />
      <Path
        d={rounded({ x: x + 16, y: top + 5.2, w: track, h: 1.6, r: 0.8 })}
        fill={FIXED_INK.white}
        fillOpacity={0.25}
      />
      <Path
        d={rounded({ x: x + 16, y: top + 5.2, w: track * 0.45, h: 1.6, r: 0.8 })}
        fill={FIXED_INK.white}
      />
    </>
  );
}

function BatteryBar({
  level,
  charging,
  slab,
}: {
  readonly level: number;
  readonly charging: boolean;
  readonly slab: Slab;
}): ReactNode {
  const colour = useColour(bandOf(level));
  const { x, y, w, h } = screenBounds(slab);
  const track = w - 8;
  const top = y + h - 7.4;
  return (
    <>
      <Path
        d={rounded({ x: x + 4, y: top, w: track, h: BAR_HEIGHT, r: BAR_HEIGHT / 2 })}
        fill={FIXED_INK.white}
        fillOpacity={0.2}
      />
      <Path
        d={rounded({
          x: x + 4,
          y: top,
          w: fillWidth(track, level),
          h: BAR_HEIGHT,
          r: BAR_HEIGHT / 2,
        })}
        fill={colour}
      />
      {charging ? (
        <Path
          d={BOLT}
          transform={`translate(${String(centreOf(slab))} ${String(top - 7)}) scale(1.5)`}
          fill={colour}
          stroke={PHONE_GLASS.off}
          strokeWidth={0.5}
          strokeLinejoin="round"
        />
      ) : null}
    </>
  );
}

function Hot({ slab }: { readonly slab: Slab }): ReactNode {
  const warning = useColour('warning');
  const { x, y, w, h } = screenBounds(slab);
  return (
    <>
      <Path d={rounded({ x, y, w, h, r: slab.screenR })} fill={warning} fillOpacity={0.16} />
      <Path
        d={THERMOMETER}
        transform={`translate(${String(centreOf(slab) - 3.6)} ${String(y + h * 0.58)}) scale(0.3)`}
        fill="none"
        stroke={FIXED_INK.white}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

interface ScreenContent {
  readonly facts: PhoneFacts;
  readonly slab: Slab;
  readonly size: VisualSize;
  readonly tint: string;
  readonly time: string | null;
}

function Chrome({ facts, slab, size, tint }: Omit<ScreenContent, 'time'>): ReactNode {
  const { x, y } = screenBounds(slab);
  const tile = size === 'tile';
  return (
    <>
      {tile || facts.notifications === 0 ? null : (
        <Notifications count={facts.notifications} slab={slab} top={y + 34} />
      )}
      {tile || !facts.playing ? null : <Playing slab={slab} top={y + 46} tint={tint} />}
      {tile || facts.ringer === null ? null : <Ringer mode={facts.ringer} x={x + 7} y={y + 7} />}
    </>
  );
}

export function ScreenFace({ facts, slab, size, tint, time }: ScreenContent): ReactNode {
  const { y } = screenBounds(slab);
  return (
    <>
      {facts.inCall ? (
        <Call slab={slab} top={y} />
      ) : (
        <Clock slab={slab} top={y + 6} time={time} size={size} />
      )}
      {facts.hot ? <Hot slab={slab} /> : null}
      <Chrome facts={facts} slab={slab} size={size} tint={tint} />
      {facts.level === null ? null : (
        <BatteryBar level={facts.level} charging={facts.charging} slab={slab} />
      )}
    </>
  );
}
