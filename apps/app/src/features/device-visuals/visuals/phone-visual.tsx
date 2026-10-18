import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { BREATHE, EASE_IN_OUT, RING, loopStyle, sway } from '../../../design/loops';
import { clock } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { phoneFacts } from '../model/facts/phone';
import { Canvas, FULL, Layer, scaled, useSvgId } from '../parts/frame';
import { GlowGradient, useInk } from '../parts/ink';
import { CameraIsland, Glass, Hinge, PhoneFrame, Wallpaper } from '../parts/phone-body';
import { BODY_TOP, centreOf, screenBounds, slabOf, type Slab } from '../parts/phone-geometry';
import { ScreenFace } from '../parts/phone-screen';
import { rounded } from '../parts/shapes';
import type { PhoneFacts, VisualProps, VisualSize } from '../types';

const SHAKE_PX = 2;
const SHAKE_MS = 110;
const WAVE_MS = 1600;
const WAVE_DELAY_MS = 800;
const STATIC_WAVE_OPACITY = 0.6;
const PULSE_OPACITY = 0.34;
const PULSE_MS = 1200;
const TORCH_OPACITY = 0.55;
const GLOW_STRENGTH = 0.42;
const LOW_LEVEL = 20;

type GlowRole = 'primary' | 'positive' | 'critical' | 'warning';

function glowRoleOf(facts: PhoneFacts): GlowRole | null {
  if (facts.ringing) return 'primary';
  if (facts.charging) return 'positive';
  if (facts.level !== null && facts.level <= LOW_LEVEL) return 'critical';
  return facts.hot ? 'warning' : null;
}

function Halo({
  px,
  slab,
  role,
}: {
  readonly px: number;
  readonly slab: Slab;
  readonly role: GlowRole;
}): ReactNode {
  const id = useSvgId('phone-glow');
  const colour = useColour(role);
  return (
    <Layer box={FULL} px={px}>
      <Canvas px={px}>
        <GlowGradient id={id} colour={colour} strength={GLOW_STRENGTH} />
        <Ellipse cx={centreOf(slab)} cy={54} rx={slab.w / 2 + 14} ry={48} fill={`url(#${id})`} />
      </Canvas>
    </Layer>
  );
}

function Torch({ slab }: { readonly slab: Slab }): ReactNode {
  const id = useSvgId('phone-torch');
  const warm = useColour('warning');
  const x = slab.w > 50 ? slab.x + slab.w - 8 : centreOf(slab);
  return (
    <>
      <LinearGradient id={id} x1="0.5" y1="1" x2="0.5" y2="0">
        <Stop offset="0" stopColor={warm} stopOpacity={TORCH_OPACITY} />
        <Stop offset="1" stopColor={warm} stopOpacity={0} />
      </LinearGradient>
      <Path
        d={`M${String(x - 2.6)} ${String(BODY_TOP + 1)}L${String(x + 2.6)} ${String(BODY_TOP + 1)}L${String(x + 12)} 0.5L${String(x - 12)} 0.5Z`}
        fill={`url(#${id})`}
      />
    </>
  );
}

function waveArc(slab: Slab, step: number, side: 'left' | 'right'): string {
  const gap = 7 + step * 4;
  const x = side === 'left' ? slab.x - gap : slab.x + slab.w + gap;
  const bow = side === 'left' ? -4 : 4;
  return `M${String(x)} 36q${String(bow)} 14 0 28`;
}

function Wave({
  px,
  slab,
  step,
  colour,
  moving,
}: {
  readonly px: number;
  readonly slab: Slab;
  readonly step: number;
  readonly colour: string;
  readonly moving: boolean;
}): ReactNode {
  const motion = loopStyle(
    { name: RING, ms: WAVE_MS, easing: 'ease-out', delay: step * WAVE_DELAY_MS },
    moving,
  );
  return (
    <Layer box={FULL} px={px} motion={motion}>
      <Canvas px={px}>
        {(['left', 'right'] as const).map((side) => (
          <Path
            key={side}
            d={waveArc(slab, step, side)}
            fill="none"
            stroke={colour}
            strokeWidth={2}
            strokeLinecap="round"
            strokeOpacity={moving ? 1 : STATIC_WAVE_OPACITY - step * 0.25}
          />
        ))}
      </Canvas>
    </Layer>
  );
}

function Waves({
  px,
  slab,
  moving,
}: {
  readonly px: number;
  readonly slab: Slab;
  readonly moving: boolean;
}): ReactNode {
  const colour = useColour('primary');
  return (
    <>
      {[0, 1].map((step) => (
        <Wave key={step} px={px} slab={slab} step={step} colour={colour} moving={moving} />
      ))}
    </>
  );
}

function Pulse({
  px,
  slab,
  moving,
}: {
  readonly px: number;
  readonly slab: Slab;
  readonly moving: boolean;
}): ReactNode {
  const colour = useColour('primary');
  const motion = loopStyle(
    { name: BREATHE, ms: PULSE_MS, easing: EASE_IN_OUT, alternate: true },
    moving,
  );
  return (
    <Layer box={FULL} px={px} motion={motion}>
      <Canvas px={px}>
        <Path
          d={rounded(screenBounds(slab))}
          fill={colour}
          fillOpacity={moving ? PULSE_OPACITY : PULSE_OPACITY / 2}
        />
      </Canvas>
    </Layer>
  );
}

function Shaker({
  px,
  shaking,
  children,
}: {
  readonly px: number;
  readonly shaking: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const frame: ViewStyle = { position: 'absolute', left: 0, top: 0, width: px, height: px };
  const motion = loopStyle(
    { name: sway(scaled(SHAKE_PX, px)), ms: SHAKE_MS, easing: EASE_IN_OUT, alternate: true },
    shaking,
  );
  return (
    <Animated.View pointerEvents="none" style={[frame, motion]}>
      {children}
    </Animated.View>
  );
}

interface HandsetProps {
  readonly facts: PhoneFacts;
  readonly slab: Slab;
  readonly size: VisualSize;
  readonly lit: boolean;
  readonly px: number;
}

function Handset({
  facts,
  slab,
  size,
  lit,
  px,
  time,
}: HandsetProps & { readonly time: string | null }): ReactNode {
  const ink = useInk();
  const wall = useSvgId('phone-wall');
  const tint = useColour('viz-2');
  return (
    <Layer box={FULL} px={px}>
      <Canvas px={px}>
        <Wallpaper id={wall} />
        <PhoneFrame slab={slab} ink={ink} />
        <Glass slab={slab} lit={lit} wall={wall} />
        {lit ? <ScreenFace facts={facts} slab={slab} size={size} tint={tint} time={time} /> : null}
        {facts.fold === 'open' ? <Hinge slab={slab} /> : null}
        <CameraIsland slab={slab} />
      </Canvas>
    </Layer>
  );
}

function ClockedHandset(props: HandsetProps): ReactNode {
  return <Handset {...props} time={clock(useMinute())} />;
}

function Ringing({
  px,
  slab,
  lit,
  animate,
  children,
}: {
  readonly px: number;
  readonly slab: Slab;
  readonly lit: boolean;
  readonly animate: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <>
      <Waves px={px} slab={slab} moving={animate} />
      <Shaker px={px} shaking={animate}>
        {children}
        {lit ? <Pulse px={px} slab={slab} moving={animate} /> : null}
      </Shaker>
    </>
  );
}

export function PhoneVisual({ state, size, px, tone, moving, reduced }: VisualProps): ReactNode {
  const facts = phoneFacts(state);
  const offline = tone === 'offline';
  const slab = slabOf(facts.fold);
  const glow = offline ? null : glowRoleOf(facts);
  const lit = facts.screenOn && !offline;
  const props: HandsetProps = { facts, slab, size, lit, px };
  const handset =
    size === 'hero' ? <ClockedHandset {...props} /> : <Handset {...props} time={null} />;
  const animate = moving && !reduced;
  return (
    <>
      {glow === null ? null : <Halo px={px} slab={slab} role={glow} />}
      {facts.ringing && !offline ? (
        <Ringing px={px} slab={slab} lit={lit} animate={animate}>
          {handset}
        </Ringing>
      ) : (
        handset
      )}
      {facts.torch && !offline ? (
        <Canvas px={px} layer>
          <Torch slab={slab} />
        </Canvas>
      ) : null}
    </>
  );
}
