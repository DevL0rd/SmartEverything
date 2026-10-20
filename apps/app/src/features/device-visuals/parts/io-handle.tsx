import type { ReactNode } from 'react';
import { Circle, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { useColour, useColourResolver } from '../../../design/colour';
import { type HandleMaterial, type HeadRim, type IoState } from '../model/io-look';
import { useSvgId } from './frame';
import { BODY_PATH, BRISTLE, BUTTON_CENTRE, HEAD_CENTRE, HEAD_TURN } from './io-layers';
import { ContactShadow } from './material';
import { rounded } from './shapes';

const STEM_PATH = 'M17.5 20H22.5L24.5 72H15.5Z';
const GLASS_PATH = rounded({ x: 13.5, y: 88, w: 13, h: 32, r: 4 });
const STRIP = rounded({ x: 10, y: 82, w: 2.5, h: 142, r: 1.25 });
const BAND_PATH = rounded({ x: 15.7, y: 64, w: 8.6, h: 2, r: 0 });
const STEM_FILL = ['#B9BFCC', '#F3F5F9', '#9AA1B0'] as const;
const GLASS_FILL = '#0A0C10';
const GLASS_EDGE = '#2B2F38';

interface BarrelLook {
  readonly material: HandleMaterial;
  readonly state: IoState;
  readonly showGlass: boolean;
}

function Barrel({ material, state, showGlass }: BarrelLook): ReactNode {
  const colour = useColourResolver();
  const body = useSvgId('handleBody');
  const shine = useSvgId('handleShine');
  return (
    <>
      <Defs>
        <LinearGradient id={body} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={material.edge} />
          <Stop offset="0.2" stopColor={material.body} />
          <Stop offset="0.42" stopColor={material.shine} />
          <Stop offset="0.78" stopColor={material.body} />
          <Stop offset="1" stopColor={material.edge} />
        </LinearGradient>
        <LinearGradient id={shine} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.16} />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path
        d={BODY_PATH}
        fill={`url(#${body})`}
        stroke={colour('on-surface')}
        strokeOpacity={0.22}
        strokeWidth={0.4}
      />
      <Path d={STRIP} fill="#FFFFFF" fillOpacity={0.2} />
      <Path
        d="M32.4 84V222"
        stroke="#000000"
        strokeOpacity={0.18}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      {showGlass ? <Glass shine={shine} dark={state === 'asleep'} /> : null}
      <PowerButton material={material} asleep={state === 'asleep'} />
    </>
  );
}

function Glass({ shine, dark }: { readonly shine: string; readonly dark: boolean }): ReactNode {
  return (
    <>
      <Path d={GLASS_PATH} fill={GLASS_FILL} stroke={GLASS_EDGE} strokeWidth={0.35} />
      {dark ? null : (
        <Path d="M13.5 112L26.5 96V92a4 4 0 0 0-4-4H17.5a4 4 0 0 0-4 4Z" fill={`url(#${shine})`} />
      )}
    </>
  );
}

function PowerButton({
  material,
  asleep,
}: {
  readonly material: HandleMaterial;
  readonly asleep: boolean;
}): ReactNode {
  const colour = useColourResolver();
  return (
    <>
      <Circle
        cx={BUTTON_CENTRE.x}
        cy={BUTTON_CENTRE.y}
        r={4}
        fill={material.body}
        stroke={colour('on-surface')}
        strokeOpacity={0.3}
        strokeWidth={0.4}
      />
      <Path
        d="M20 133.4v2.8M18.1 134.4a2.8 2.8 0 1 0 3.8 0"
        fill="none"
        stroke={colour(asleep ? 'on-surface-faint' : 'on-surface-variant')}
        strokeWidth={0.55}
        strokeLinecap="round"
      />
    </>
  );
}

function Stem({
  rim,
  band,
  light,
}: {
  readonly rim: HeadRim;
  readonly band: boolean;
  readonly light: boolean;
}): ReactNode {
  const colour = useColourResolver();
  const fill = useSvgId('handleStem');
  return (
    <>
      <Defs>
        <LinearGradient id={fill} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={STEM_FILL[0]} />
          <Stop offset="0.5" stopColor={STEM_FILL[1]} />
          <Stop offset="1" stopColor={STEM_FILL[2]} />
        </LinearGradient>
      </Defs>
      <Path
        d={STEM_PATH}
        fill={`url(#${fill})`}
        stroke={colour(light ? 'on-surface-variant' : 'outline')}
        strokeWidth={light ? 0.6 : 0.35}
      />
      {band ? <Path d={BAND_PATH} fill={colour(rim ?? 'outline')} fillOpacity={0.9} /> : null}
    </>
  );
}

function HeadRing({
  rx,
  ry,
  ...paint
}: {
  readonly rx: number;
  readonly ry: number;
  readonly fill: string;
  readonly fillOpacity?: number;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly strokeDasharray?: string;
}): ReactNode {
  return <Ellipse cx={HEAD_CENTRE.x} cy={HEAD_CENTRE.y} rx={rx} ry={ry} {...paint} />;
}

function HeadPlate({
  rim,
  fitted,
  light,
}: {
  readonly rim: HeadRim;
  readonly fitted: boolean;
  readonly light: boolean;
}): ReactNode {
  const colour = useColourResolver();
  const bristle = light ? BRISTLE.light : BRISTLE.dark;
  if (!fitted) {
    return (
      <G transform={HEAD_TURN}>
        <HeadRing
          rx={7}
          ry={8.5}
          fill="none"
          stroke={colour('on-surface-variant')}
          strokeWidth={0.8}
          strokeDasharray="2 2"
        />
      </G>
    );
  }
  return (
    <G transform={HEAD_TURN}>
      {light ? (
        <HeadRing
          rx={7.7}
          ry={9.2}
          fill="none"
          stroke={colour('on-surface-variant')}
          strokeWidth={0.5}
        />
      ) : null}
      <HeadRing
        rx={7}
        ry={8.5}
        fill={bristle}
        fillOpacity={0.18}
        stroke={colour(rim ?? 'outline')}
        strokeWidth={1}
      />
      <HeadRing rx={5.4} ry={6.8} fill={bristle} fillOpacity={0.28} />
    </G>
  );
}

function Puck(): ReactNode {
  const colour = useColourResolver();
  return (
    <>
      <Path
        d="M1 235a19 4 0 0 0 38 0v2a19 4 0 0 1-38 0Z"
        fill={colour('surface-2')}
        stroke={colour('outline')}
        strokeWidth={0.4}
      />
      <Ellipse
        cx={20}
        cy={235}
        rx={19}
        ry={4}
        fill={colour('surface-3')}
        stroke={colour('outline')}
        strokeWidth={0.4}
      />
    </>
  );
}

function Outline(): ReactNode {
  const stroke = useColour('on-surface-variant');
  const dashed = { fill: 'none', stroke, strokeWidth: 0.8, strokeDasharray: '2 2' } as const;
  return (
    <>
      <Path d={BODY_PATH} {...dashed} />
      <Path d={STEM_PATH} {...dashed} />
      <G transform={HEAD_TURN}>
        <Ellipse cx={HEAD_CENTRE.x} cy={HEAD_CENTRE.y} rx={7} ry={8.5} {...dashed} />
      </G>
    </>
  );
}

function LinkOff(): ReactNode {
  const colour = useColourResolver();
  return (
    <G transform="translate(20 190)">
      <Circle r={7} fill={colour('surface-1')} stroke={colour('warning')} strokeWidth={1} />
      <Path
        d="M-3 2l1.5-1.5M1.5-1.5L3-3M-2.4-2.4a2.6 2.6 0 0 1 3.4.3M1 2.4a2.6 2.6 0 0 1-3.4-.3M-3.6 3.6L3.6-3.6"
        fill="none"
        stroke={colour('warning')}
        strokeWidth={1}
        strokeLinecap="round"
      />
    </G>
  );
}

export interface HandleLook extends BarrelLook {
  readonly rim: HeadRim;
  readonly head: boolean;
  readonly light: boolean;
}

const OPACITY: Readonly<Record<IoState, number>> = {
  asleep: 0.86,
  standby: 1,
  brushing: 1,
  paused: 1,
  summary: 1,
  charging: 1,
  unreachable: 0.5,
  busy: 0.5,
};

export function IoHandle({ look }: { readonly look: HandleLook }): ReactNode {
  const { state } = look;
  const out = state === 'unreachable' || state === 'busy';
  return (
    <>
      <G opacity={OPACITY[state]}>
        {state === 'charging' ? <Puck /> : <ContactShadow cx={20} cy={236} rx={16} ry={2.4} />}
        <Stem rim={look.rim} band={look.head} light={look.light} />
        <HeadPlate rim={look.rim} fitted={look.head} light={look.light} />
        <Barrel material={look.material} state={state} showGlass={look.showGlass} />
      </G>
      {out ? <Outline /> : null}
      {state === 'busy' ? <LinkOff /> : null}
    </>
  );
}
