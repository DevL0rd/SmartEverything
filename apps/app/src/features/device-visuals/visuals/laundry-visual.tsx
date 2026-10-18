import { useEffect, useState, type ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { Circle, Ellipse, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { loopStyle, sway } from '../../../design/loops';
import { LAUNDRY_GLOW_ROLE, LAUNDRY_UNKNOWN } from '../model/laundry-facts';
import { pulseOf } from '../parts/drum-motion';
import { Clothes, Drum, Foam, Glass, Heat, Sparkle, SpinBlur, Steam, Water } from '../parts/drum';
import { Canvas, FULL, Layer, scaled, useSvgId } from '../parts/frame';
import { FIXED_INK, GlowGradient, useInk, type VisualInk } from '../parts/ink';
import { Cabinet, DRUM } from '../parts/washer-body';
import { arcPath } from '../parts/shapes';
import type { LaundryFacts, VisualProps, VisualSize } from '../types';

const WARNING = 'M50 49.6L58 63.6H42Z';
const BANG = 'M50 54.4v4.4M50 61.2h0';
const CLEAN = 'M44 57a6 6 0 1 1 2 4.5M44 61.2v-3.6h3.6';
const CHECK = 'M46.5 57l2.6 2.8l5-5.6';
const CRESCENT = 'M33 49A19 19 0 0 1 45 38.6M31.6 56A19 19 0 0 1 32.4 52';
const SPARKLE_MS = 3200;
const PULSE_MS = 2500;
const SHAKE_RPM = 1000;

function Backdrop({
  px,
  colour,
  pulse,
}: {
  readonly px: number;
  readonly colour: string;
  readonly pulse: boolean;
}): ReactNode {
  const id = useSvgId('halo');
  return (
    <Layer box={FULL} px={px} motion={pulseOf(pulse)}>
      <Canvas px={px}>
        <GlowGradient id={id} colour={colour} />
        <Circle cx={50} cy={57} r={48} fill={`url(#${id})`} />
      </Canvas>
    </Layer>
  );
}

function Progress({
  progress,
  colour,
  track,
  hero,
}: {
  readonly progress: number | null;
  readonly colour: string;
  readonly track: string;
  readonly hero: boolean;
}): ReactNode {
  if (progress === null) {
    return null;
  }
  const ring = { ...DRUM, r: 30 };
  return (
    <>
      {hero ? <Circle {...ring} fill="none" stroke={track} strokeWidth={2.2} /> : null}
      {progress > 0.01 ? (
        <Path
          d={arcPath(ring, 0, progress * 360)}
          fill="none"
          stroke={colour}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      ) : null}
    </>
  );
}

function Marks({
  facts,
  tile,
}: {
  readonly facts: LaundryFacts;
  readonly tile: boolean;
}): ReactNode {
  const positive = useColour('positive');
  const critical = useColour('critical');
  if (tile) {
    return facts.finished ? (
      <>
        <Circle {...DRUM} r={7} fill={positive} />
        <Path
          d={CHECK}
          fill="none"
          stroke={FIXED_INK.white}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ) : null;
  }
  if (facts.faultCode !== null) {
    return (
      <>
        <Path
          d={WARNING}
          fill={critical}
          stroke={critical}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
        <Path d={BANG} stroke={FIXED_INK.white} strokeWidth={1.5} strokeLinecap="round" />
      </>
    );
  }
  return facts.cleaned ? (
    <Path
      d={CLEAN}
      fill="none"
      stroke={positive}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ) : null;
}

function OpenDoor({ ink, tile }: { readonly ink: VisualInk; readonly tile: boolean }): ReactNode {
  return (
    <>
      <Ellipse
        cx={24}
        cy={57}
        rx={9}
        ry={26}
        fill={ink.light}
        stroke={ink.edge}
        strokeWidth={0.9}
      />
      {tile ? null : <Ellipse cx={23.4} cy={57} rx={6} ry={20} fill={ink.well} fillOpacity={0.5} />}
    </>
  );
}

function Face({
  facts,
  size,
  ink,
  colour,
}: {
  readonly facts: LaundryFacts;
  readonly size: VisualSize;
  readonly ink: VisualInk;
  readonly colour: string;
}): ReactNode {
  const tile = size === 'tile';
  const hero = size === 'hero';
  return (
    <>
      {facts.door === 'open' ? <OpenDoor ink={ink} tile={tile} /> : null}
      {tile ? null : (
        <Circle
          {...DRUM}
          r={20.8}
          fill="none"
          stroke={ink.sheen}
          strokeOpacity={0.12}
          strokeWidth={0.6}
        />
      )}
      {tile ? null : (
        <Path
          d={CRESCENT}
          fill="none"
          stroke={FIXED_INK.white}
          strokeOpacity={0.2}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      )}
      {tile ? null : (
        <Progress progress={facts.progress} colour={colour} track={ink.faint} hero={hero} />
      )}
      <Marks facts={facts} tile={tile} />
    </>
  );
}

function useEntry(active: boolean, visible: boolean, ms: number): boolean {
  const [seen, setSeen] = useState(active);
  const [entered, setEntered] = useState(false);
  if (active !== seen) {
    setSeen(active);
    setEntered(active && visible);
  }
  useEffect(() => {
    if (!entered) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setEntered(false);
    }, ms);
    return (): void => {
      clearTimeout(timer);
    };
  }, [entered, ms]);
  return entered;
}

function shakes(facts: LaundryFacts): boolean {
  return facts.motion === 'spin' && (facts.spin ?? 0) >= SHAKE_RPM;
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
    { name: sway(scaled(0.8, px)), ms: 90, easing: 'ease-in-out', alternate: true },
    shaking,
  );
  return (
    <Animated.View pointerEvents="none" style={[frame, motion]}>
      {children}
    </Animated.View>
  );
}

interface SceneProps {
  readonly px: number;
  readonly facts: LaundryFacts;
  readonly size: VisualSize;
  readonly moving: boolean;
  readonly reduced: boolean;
}

function Scene({ px, facts, size, moving, reduced }: SceneProps): ReactNode {
  const tile = size === 'tile';
  const flowing = moving && !facts.frozen;
  return (
    <Glass px={px}>
      <Water px={px} facts={facts} tile={tile} moving={moving} reduced={reduced} />
      <Drum px={px} facts={facts} tile={tile} moving={moving} />
      <Clothes px={px} facts={facts} tile={tile} moving={moving} />
      <SpinBlur px={px} facts={facts} tile={tile} moving={flowing} />
      <Foam px={px} facts={facts} size={size} animated={flowing} />
      <Steam px={px} facts={facts} tile={tile} animated={flowing} />
      <Heat px={px} facts={facts} tile={tile} moving={moving} />
    </Glass>
  );
}

function Celebration({
  px,
  facts,
  visible,
}: {
  readonly px: number;
  readonly facts: LaundryFacts;
  readonly visible: boolean;
}): ReactNode {
  const sparkle = useEntry(facts.finished, visible, SPARKLE_MS);
  return sparkle ? <Sparkle px={px} /> : null;
}

function PulsingBackdrop({
  px,
  fault,
  colour,
  visible,
}: {
  readonly px: number;
  readonly fault: boolean;
  readonly colour: string;
  readonly visible: boolean;
}): ReactNode {
  return <Backdrop px={px} colour={colour} pulse={useEntry(fault, visible, PULSE_MS)} />;
}

function Halo({
  px,
  facts,
  colour,
  visible,
}: {
  readonly px: number;
  readonly facts: LaundryFacts;
  readonly colour: string;
  readonly visible: boolean;
}): ReactNode {
  const fault = facts.faultCode !== null;
  if (facts.glow === 'rest' || (facts.hosted === true && !fault)) {
    return null;
  }
  return <PulsingBackdrop px={px} fault={fault} colour={colour} visible={visible} />;
}

export function LaundryVisual({ state, size, px, tone, moving, reduced }: VisualProps): ReactNode {
  const facts = state.laundry ?? LAUNDRY_UNKNOWN;
  const ink = useInk();
  const tile = size === 'tile';
  const colour = useColour(LAUNDRY_GLOW_ROLE[tone === 'active' ? facts.glow : 'rest']);
  const warm = useColour('laundry-warm');
  const cool = useColour('laundry-cool');
  const visible = moving && !reduced;
  const shaking = moving && shakes(facts);
  const scene = (
    <>
      <Halo px={px} facts={facts} colour={colour} visible={visible} />
      <Canvas px={px} layer>
        <Cabinet facts={facts} ink={ink} size={size} colour={colour} warm={warm} cool={cool} />
      </Canvas>
      <Scene px={px} facts={facts} size={size} moving={moving} reduced={reduced} />
      {tile && !facts.finished && facts.door !== 'open' ? null : (
        <Canvas px={px} layer>
          <Face facts={facts} size={size} ink={ink} colour={colour} />
        </Canvas>
      )}
      {tile ? null : <Celebration px={px} facts={facts} visible={visible} />}
    </>
  );
  return size === 'hero' ? (
    <Shaker px={px} shaking={shaking}>
      {scene}
    </Shaker>
  ) : (
    scene
  );
}
