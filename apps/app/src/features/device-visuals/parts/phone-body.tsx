import type { ReactNode } from 'react';
import { Circle, LinearGradient, Path, Stop } from 'react-native-svg';
import { PHONE_GLASS } from '../../../design/product-colours';
import { useSvgId } from './frame';
import { BodyGradient, FIXED_INK, type VisualInk } from './ink';
import { ContactShadow, Shine } from './material';
import {
  BODY_HEIGHT,
  BODY_TOP,
  bodyBounds,
  centreOf,
  screenBounds,
  type Slab,
} from './phone-geometry';
import { rounded } from './shapes';

const FLOOR_Y = 98.4;
const BUTTON_OPACITY = 0.8;
const CAMERA = { y: BODY_TOP + 5.2, r: 1.5 } as const;
const REFLECTION_OPACITY = 0.06;

function SideButtons({
  slab,
  colour,
}: {
  readonly slab: Slab;
  readonly colour: string;
}): ReactNode {
  const edge = slab.x + slab.w;
  return (
    <>
      <Path
        d={rounded({ x: edge - 0.2, y: 28, w: 1.8, h: 10, r: 0.9 })}
        fill={colour}
        fillOpacity={BUTTON_OPACITY}
      />
      <Path
        d={rounded({ x: edge - 0.2, y: 42, w: 1.8, h: 18, r: 0.9 })}
        fill={colour}
        fillOpacity={BUTTON_OPACITY}
      />
    </>
  );
}

function Rim({ slab, ink }: { readonly slab: Slab; readonly ink: VisualInk }): ReactNode {
  const id = useSvgId('phone-rim');
  const inset = rounded({
    x: slab.x + 0.7,
    y: BODY_TOP + 0.7,
    w: slab.w - 1.4,
    h: BODY_HEIGHT - 1.4,
    r: slab.r - 0.6,
  });
  return (
    <>
      <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={ink.sheen} stopOpacity={0.5} />
        <Stop offset="0.5" stopColor={ink.sheen} stopOpacity={0.08} />
        <Stop offset="1" stopColor={ink.sheen} stopOpacity={0.3} />
      </LinearGradient>
      <Path d={inset} fill="none" stroke={`url(#${id})`} strokeWidth={0.9} />
    </>
  );
}

export function PhoneFrame({
  slab,
  ink,
}: {
  readonly slab: Slab;
  readonly ink: VisualInk;
}): ReactNode {
  const id = useSvgId('phone-body');
  const body = rounded(bodyBounds(slab));
  return (
    <>
      <ContactShadow cx={centreOf(slab)} cy={FLOOR_Y} rx={slab.w / 2 - 1} ry={1.8} />
      <SideButtons slab={slab} colour={ink.edge} />
      <BodyGradient id={id} ink={ink} vertical />
      <Path d={body} fill={`url(#${id})`} stroke={ink.edge} strokeWidth={1.1} />
      <Shine d={body} gloss />
      <Rim slab={slab} ink={ink} />
    </>
  );
}

export function Glass({
  slab,
  lit,
  wall,
}: {
  readonly slab: Slab;
  readonly lit: boolean;
  readonly wall: string;
}): ReactNode {
  const glass = rounded(screenBounds(slab));
  const { x, y, w, h } = screenBounds(slab);
  return (
    <>
      <Path d={glass} fill={lit ? `url(#${wall})` : PHONE_GLASS.off} />
      {lit ? null : (
        <Path
          d={`M${String(x)} ${String(y + h * 0.78)}L${String(x + w)} ${String(y + h * 0.28)}L${String(x + w)} ${String(y + h * 0.42)}L${String(x)} ${String(y + h * 0.92)}Z`}
          fill={FIXED_INK.white}
          fillOpacity={REFLECTION_OPACITY}
        />
      )}
    </>
  );
}

export function Wallpaper({ id }: { readonly id: string }): ReactNode {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor={PHONE_GLASS.wallTop} />
      <Stop offset="1" stopColor={PHONE_GLASS.wallBottom} />
    </LinearGradient>
  );
}

export function CameraIsland({ slab }: { readonly slab: Slab }): ReactNode {
  const x = slab.w > 50 ? slab.x + slab.w - 8 : centreOf(slab);
  return (
    <Circle
      cx={x}
      cy={CAMERA.y}
      r={CAMERA.r}
      fill={PHONE_GLASS.off}
      stroke={FIXED_INK.white}
      strokeOpacity={0.14}
      strokeWidth={0.5}
    />
  );
}

export function Hinge({ slab }: { readonly slab: Slab }): ReactNode {
  const { y, h } = screenBounds(slab);
  const x = centreOf(slab);
  return (
    <Path
      d={`M${String(x)} ${String(y)}V${String(y + h)}`}
      stroke={PHONE_GLASS.off}
      strokeWidth={0.9}
      strokeOpacity={0.75}
    />
  );
}
