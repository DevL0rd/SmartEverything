import { useState, type ReactNode } from 'react';
import { BLINK, BREATHE, GLOW, RING, loopStyle, type LoopStyle } from '../../../design/loops';
import {
  displayOf,
  driveDuration,
  driveOf,
  headRimOf,
  ioLabel,
  ioStateOf,
  materialOf,
  moveOf,
  ringOf,
  type IoMove,
  type IoRing,
  type IoState,
} from '../model/io-look';
import { DisplayRest, TimerText } from '../parts/io-display';
import { IoHandle, type HandleLook } from '../parts/io-handle';
import {
  BOXES,
  ChargeRing,
  Ring,
  RippleRing,
  Slab,
  SweepSpark,
  Tufts,
  driveFrames,
  sweepFrames,
  useLightTheme,
} from '../parts/io-layers';
import type { BrushActivity } from '@smarteverything/domain';
import type { ToothbrushFacts, VisualProps } from '../types';

const PULSE_MS = 700;
const GLOW_MS = 1700;
const BLINK_MS = 500;
const BLINK_TIMES = 2;
const SWEEP_MS = 600;
const RIPPLE_MS = 300;

interface Motion {
  readonly drive: LoopStyle | null;
  readonly pulse: LoopStyle | null;
  readonly glow: LoopStyle | null;
  readonly blink: LoopStyle | null;
}

function motionOf(
  facts: ToothbrushFacts,
  look: { readonly state: IoState; readonly ring: IoRing; readonly playing: boolean },
): Motion {
  const { state, ring, playing } = look;
  const drive = driveOf(facts);
  return {
    drive: loopStyle(
      { name: driveFrames(drive), ms: driveDuration(drive) },
      playing && state === 'brushing',
    ),
    pulse: loopStyle(
      { name: BREATHE, ms: PULSE_MS, alternate: true },
      playing && state === 'brushing' && ring.kind === 'pressure' && ring.level === 'hard',
    ),
    glow: loopStyle({ name: GLOW, ms: GLOW_MS, alternate: true }, playing && state === 'charging'),
    blink: loopStyle(
      { name: BLINK, ms: BLINK_MS, times: BLINK_TIMES },
      playing && state === 'paused',
    ),
  };
}

interface Played {
  readonly move: IoMove;
  readonly key: number;
}

function useMove(activity: BrushActivity, playing: boolean): Played | null {
  const [seen, setSeen] = useState(activity);
  const [played, setPlayed] = useState<Played | null>(null);
  if (seen !== activity) {
    setSeen(activity);
    const move = playing ? moveOf(seen, activity) : null;
    setPlayed(move === null ? null : { move, key: (played?.key ?? 0) + 1 });
  } else if (!playing && played !== null) {
    setPlayed(null);
  }
  return played;
}

function Moves({ played, px }: { readonly played: Played | null; readonly px: number }): ReactNode {
  if (played === null) {
    return null;
  }
  if (played.move === 'wake') {
    return (
      <Slab
        key={played.key}
        box={BOXES.sweep}
        px={px}
        motion={loopStyle(
          { name: sweepFrames(px), ms: SWEEP_MS, easing: 'ease-out', times: 1 },
          true,
        )}
      >
        <SweepSpark />
      </Slab>
    );
  }
  return (
    <Slab
      key={played.key}
      box={BOXES.button}
      px={px}
      motion={loopStyle({ name: RING, ms: RIPPLE_MS, easing: 'ease-out', times: 1 }, true)}
    >
      <RippleRing />
    </Slab>
  );
}

function Glass({
  facts,
  state,
  px,
  blink,
}: {
  readonly facts: ToothbrushFacts;
  readonly state: IoState;
  readonly px: number;
  readonly blink: LoopStyle | null;
}): ReactNode {
  const display = displayOf(facts, state);
  if (display.kind === 'none' || display.kind === 'dark') {
    return null;
  }
  return (
    <>
      <Slab box={BOXES.glass} px={px}>
        <DisplayRest display={display} />
      </Slab>
      {display.kind === 'timer' ? (
        <Slab box={BOXES.timer} px={px} motion={blink}>
          <TimerText display={display} />
        </Slab>
      ) : null}
    </>
  );
}

function IoStack({
  facts,
  px,
  tone,
  playing,
}: Pick<VisualProps, 'px' | 'tone'> & {
  readonly facts: ToothbrushFacts;
  readonly playing: boolean;
}): ReactNode {
  const light = useLightTheme();
  const state = ioStateOf(facts, tone);
  const ring = ringOf(facts, state);
  const motion = motionOf(facts, { state, ring, playing });
  const played = useMove(facts.activity, playing);
  const look: HandleLook = {
    material: materialOf(facts),
    state,
    showGlass: facts.display,
    rim: headRimOf(facts),
    head: facts.head !== 'missing',
    light,
  };
  return (
    <>
      <Slab box={BOXES.body} px={px} label={ioLabel(facts, tone)}>
        <IoHandle look={look} />
      </Slab>
      {motion.glow === null ? null : (
        <Slab box={BOXES.puck} px={px} motion={motion.glow}>
          <ChargeRing />
        </Slab>
      )}
      {facts.head === 'missing' ? null : (
        <Slab box={BOXES.head} px={px} motion={motion.drive}>
          <Tufts light={light} />
        </Slab>
      )}
      <Slab box={BOXES.ring} px={px} motion={motion.pulse}>
        <Ring ring={ring} />
      </Slab>
      <Glass facts={facts} state={state} px={px} blink={motion.blink} />
      <Moves played={played} px={px} />
    </>
  );
}

export function OralbVisual({ state, px, tone, moving, reduced }: VisualProps): ReactNode {
  const facts = state.toothbrush;
  if (facts === undefined) {
    return null;
  }
  const playing = moving && !reduced && tone !== 'offline';
  return <IoStack facts={facts} px={px} tone={tone} playing={playing} />;
}
