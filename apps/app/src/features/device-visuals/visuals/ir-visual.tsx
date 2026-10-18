import type { ReactNode } from 'react';
import { Circle, Ellipse, Path } from 'react-native-svg';
import { RING, loopStyle } from '../../../design/loops';
import { ripplesFor } from '../model/button-ripple';
import { Canvas, FULL, Layer, useSvgId } from '../parts/frame';
import { BodyGradient, useInk, useTint, WELL } from '../parts/ink';
import { ContactShadow, Shine } from '../parts/material';
import { arcPath, type Ring } from '../parts/shapes';
import type { IrCategory } from '../model/ir-category';
import type { IrFacts, VisualProps, VisualState } from '../types';
import { SHAPES } from './ir-remote-shapes';
import { useSeenSend } from './use-seen-send';

const PUCK = 'M22 60 V70 A28 8.5 0 0 0 78 70 V60 Z';
const WAVES: Ring = { cx: 50, cy: 54, r: 0 };
const SENT_RADIUS = 34;
const DASH = '4 3';

function Waves({ colour }: { readonly colour: string }): ReactNode {
  return [18, 27, 36].map((radius, index) => (
    <Path
      key={radius}
      d={arcPath({ ...WAVES, r: radius }, -42, 42)}
      stroke={colour}
      strokeOpacity={0.75 - index * 0.22}
      strokeWidth={2.2}
      strokeLinecap="round"
      fill="none"
    />
  ));
}

function SentRings({
  px,
  colour,
  at,
  playing,
}: {
  readonly px: number;
  readonly colour: string;
  readonly at: string | null;
  readonly playing: boolean;
}): ReactNode {
  const seen = useSeenSend(at, playing);
  return ripplesFor({ seen, at, gesture: 'single', playing }).map((ripple) => (
    <Layer
      key={ripple.key}
      box={FULL}
      px={px}
      motion={loopStyle({ name: RING, ms: ripple.ms, easing: 'ease-out', times: 1 }, true)}
    >
      <Canvas px={px}>
        <Circle cx={50} cy={58} r={SENT_RADIUS} fill="none" stroke={colour} strokeWidth={2} />
      </Canvas>
    </Layer>
  ));
}

export function IrBlasterVisual({ state, tone, px, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const playing = moving && state.online;
  const body = useSvgId('blaster');
  const tint = useTint('info', tone);
  return (
    <>
      <Canvas px={px} layer>
        <BodyGradient id={body} ink={ink} />
        <ContactShadow cx={50} cy={78} rx={36} ry={6} />
        <Path d={PUCK} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.6} />
        <Shine d={PUCK} />
        <Path
          d="M22 65 A28 8.5 0 0 0 78 65"
          stroke={ink.well}
          strokeOpacity={WELL}
          strokeWidth={3}
          fill="none"
        />
        <Ellipse
          cx={50}
          cy={60}
          rx={28}
          ry={8.5}
          fill={ink.light}
          stroke={ink.edge}
          strokeWidth={0.6}
        />
        <Ellipse cx={50} cy={60} rx={9} ry={2.8} fill={ink.well} fillOpacity={WELL} />
        <Circle cx={50} cy={60} r={1.3} fill={tint} />
        <Waves colour={tint} />
      </Canvas>
      <SentRings px={px} colour={tint} at={state.ir?.sentAt ?? null} playing={playing} />
    </>
  );
}

interface Look {
  readonly category: IrCategory;
  readonly lit: boolean;
  readonly dash: string | undefined;
  readonly failed: boolean;
  readonly sentAt: string | null;
}

const NO_FACTS: IrFacts = {
  category: 'other',
  on: null,
  assumed: true,
  failed: false,
  sentAt: null,
};

function lookOf(state: VisualState): Look {
  const facts = state.ir ?? NO_FACTS;
  return {
    category: facts.category,
    lit: facts.failed || (facts.on === true && state.online),
    dash: facts.assumed ? DASH : undefined,
    failed: facts.failed,
    sentAt: facts.sentAt,
  };
}

export function IrRemoteVisual({ state, tone, px, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const body = useSvgId('remote');
  const look = lookOf(state);
  const tint = useTint(look.failed ? 'critical' : 'primary', look.failed ? 'active' : tone);
  const Shape = SHAPES[look.category];
  const playing = moving && state.online;
  return (
    <>
      <Canvas px={px} layer>
        <BodyGradient id={body} ink={ink} />
        <ContactShadow cx={50} cy={92} rx={32} ry={4} />
        <Shape ink={ink} body={body} tint={tint} on={look.lit} dash={look.dash} />
      </Canvas>
      <SentRings px={px} colour={tint} at={look.sentAt} playing={playing} />
    </>
  );
}
