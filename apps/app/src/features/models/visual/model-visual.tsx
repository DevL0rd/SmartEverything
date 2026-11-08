import type { ModelSpec } from '@smarteverything/domain';
import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PixelRatio, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useUniwind } from 'uniwind';
import { useAnimationGate } from '../../../design/animation-gate';
import { EASING } from '../../../design/motion';
import { useStableCallback } from '../../../design/use-stable-callback';
import { useOnScreen } from '../../../design/visibility';
import { modelBakeQueue } from '../bake/bake-host';
import {
  bakeKeyHash,
  dprBucket,
  type BakeAnchor,
  type BakeKey,
  type BakeTheme,
  type BakeView,
  type ClipResult,
  type LayersResult,
} from '../bake/bake-protocol';
import type { BakeJob, BakeOutcome, BakeTicket } from '../bake/bake-queue';
import {
  activeShot,
  evaluateChannel,
  evaluateChannels,
  isMoving,
  type ChannelOutput,
  type ChannelSignals,
} from '../../../components/models/channels';
import { BAKE_VERSION } from '../../../components/models/three/bake-version';
import { ClipAtlas } from './clip-atlas';
import { LayerStack, stackMoves, type LayerSignals } from './layer';

export const FADE_IN_MS = 180;

export interface ModelSource {
  readonly spec: ModelSpec;
  readonly specHash: string;
  readonly tokenHash: string;
  readonly finish: string | null;
  readonly params: Readonly<Record<string, number>>;
}

export interface ModelLook {
  readonly source: ModelSource;
  readonly view: BakeView;
  readonly px: number;
  readonly dpr: 2 | 3;
  readonly theme: BakeTheme;
}

export interface ModelBakeKeys {
  readonly still: BakeKey | null;
  readonly clip: BakeKey | null;
}

export type ModelFace =
  | { readonly kind: 'empty' }
  | { readonly kind: 'clip'; readonly clip: ClipResult }
  | { readonly kind: 'layers'; readonly image: LayersResult };

type StateEntry = readonly [string, ChannelSignals];

function stateEntries(spec: ModelSpec): readonly StateEntry[] {
  return Object.entries(spec.states ?? {});
}

function matches(state: ChannelSignals, signals: ChannelSignals): boolean {
  return Object.entries(state).every(([name, value]) => signals[name] === value);
}

function shotOf(spec: ModelSpec, signals: ChannelSignals): string | undefined {
  return activeShot(spec.shots, signals)?.id;
}

export function stillState(spec: ModelSpec, signals: ChannelSignals): string | null {
  const states = stateEntries(spec);
  const exact = states.find(([, state]) => matches(state, signals));
  if (exact !== undefined) return exact[0];
  const shot = shotOf(spec, signals);
  const like = states.find(([, state]) => shotOf(spec, state) === shot);
  return (like ?? states[0])?.[0] ?? null;
}

export function shotSignals(spec: ModelSpec, shotId: string): ChannelSignals {
  return stateEntries(spec).find(([, state]) => shotOf(spec, state) === shotId)?.[1] ?? {};
}

export function isFunctioning(spec: ModelSpec, signals: ChannelSignals): boolean {
  if (shotOf(spec, signals) !== undefined) return true;
  return evaluateChannels(spec.channels ?? [], signals).some((frame) => isMoving(frame.output));
}

export function bakeKeys(look: ModelLook, signals: ChannelSignals): ModelBakeKeys {
  const { source } = look;
  const base = {
    specHash: source.specHash,
    bakeVersion: BAKE_VERSION,
    tokenHash: source.tokenHash,
    finish: source.finish,
    params: { ...source.params },
    view: look.view,
    width: look.px,
    height: look.px,
    dpr: look.dpr,
    theme: look.theme,
  };
  const state = stillState(source.spec, signals);
  const shotId = shotOf(source.spec, signals);
  return {
    still: state === null ? null : { ...base, target: { kind: 'keyframe', state } },
    clip: shotId === undefined ? null : { ...base, target: { kind: 'shot', shotId } },
  };
}

function speedOf(output: ChannelOutput | null): number | null {
  if (output?.kind === 'spin') return Math.abs(output.perSecond);
  if (output?.kind === 'oscillate') return Math.abs(output.speed);
  return null;
}

export function clipRate(spec: ModelSpec, signals: LayerSignals): number {
  for (const channel of spec.channels ?? []) {
    const from = speedOf(evaluateChannel(channel, signals.baked));
    const to = speedOf(evaluateChannel(channel, signals.live));
    if (from !== null && from > 0 && to !== null) return to / from;
  }
  return 1;
}

export function chooseFace(still: BakeOutcome | null, clip: BakeOutcome | null): ModelFace {
  if (clip?.kind === 'baked' && clip.bake.image.kind === 'clip') {
    return { kind: 'clip', clip: clip.bake.image };
  }
  if (still?.kind === 'baked' && still.bake.image.kind === 'layers') {
    return { kind: 'layers', image: still.bake.image };
  }
  return { kind: 'empty' };
}

interface Landed {
  readonly hash: string;
  readonly outcome: BakeOutcome;
  readonly instant: boolean;
}

function useBake(job: BakeJob | null, visible: boolean): Landed | null {
  const hash = job === null ? null : bakeKeyHash(job.key);
  const [landed, setLanded] = useState<Landed | null>(null);
  const ticket = useRef<BakeTicket | null>(null);
  const start = useStableCallback((): BakeTicket | null => {
    if (job === null || hash === null) return null;
    let sync = true;
    const priority = visible ? 'screen' : 'page';
    const held = modelBakeQueue.want({ ...job, priority }, (outcome) => {
      setLanded({ hash, outcome, instant: sync });
    });
    sync = false;
    return held;
  });
  useEffect(() => {
    const held = start();
    ticket.current = held;
    return (): void => {
      held?.release();
      ticket.current = null;
    };
  }, [hash, start]);
  useEffect(() => {
    ticket.current?.setPriority(visible ? 'screen' : 'page');
  }, [visible, hash]);
  return landed?.hash === hash ? landed : null;
}

function usePlayClock(playing: boolean): SharedValue<number> {
  const clock = useSharedValue(0);
  const frame = useFrameCallback((info) => {
    'worklet';
    clock.set(clock.get() + (info.timeSincePreviousFrame ?? 0) / 1000);
  }, false);
  useEffect(() => {
    frame.setActive(playing);
    return (): void => {
      frame.setActive(false);
    };
  }, [playing, frame]);
  return clock;
}

function useFade(landed: Landed | null, instant: boolean): SharedValue<number> {
  const hash = landed?.hash ?? null;
  const level = useSharedValue(hash === null ? 0 : 1);
  useEffect(() => {
    const target = hash === null ? 0 : 1;
    level.set(instant ? target : withTiming(target, { duration: FADE_IN_MS, easing: EASING.fade }));
  }, [hash, instant, level]);
  return level;
}

function jobOf(source: ModelSource, key: BakeKey | null, screen: string): BakeJob | null {
  return key === null ? null : { key, spec: source.spec, screen, priority: 'page' };
}

interface SquareBox {
  readonly width: number;
  readonly height: number;
}

function square(px: number): SquareBox {
  return { width: px, height: px };
}

export interface ModelVisualProps {
  readonly source: ModelSource;
  readonly view: BakeView;
  readonly px: number;
  readonly signals: ChannelSignals;
  readonly overlay?: AnchorPainter;
}

interface ShownFace {
  readonly face: ModelFace;
  readonly landed: Landed | null;
}

function useScreenKey(): string {
  const navigation = useNavigation();
  const [key] = useState(() => {
    const state = navigation.getState();
    return state?.routes[state.index]?.key ?? 'root';
  });
  return key;
}

function useModelFace(props: ModelVisualProps, visible: boolean): ShownFace {
  const { source, view, px, signals } = props;
  const theme = useUniwind().theme === 'light' ? 'light' : 'dark';
  const screen = useScreenKey();
  const look = { source, view, px, dpr: dprBucket(PixelRatio.get()), theme } as const;
  const keys = bakeKeys(look, signals);
  const still = useBake(jobOf(source, keys.still, screen), visible);
  const clip = useBake(jobOf(source, keys.clip, screen), visible);
  const face = chooseFace(still?.outcome ?? null, clip?.outcome ?? null);
  if (face.kind === 'empty') return { face, landed: null };
  return { face, landed: face.kind === 'clip' ? clip : still };
}

interface FaceGate {
  readonly moving: boolean;
  readonly reduced: boolean;
}

export interface AnchorFrame {
  readonly spec: ModelSpec;
  readonly anchors: readonly BakeAnchor[];
  readonly gate: FaceGate;
  readonly px: number;
}

export type AnchorPainter = (frame: AnchorFrame) => ReactNode;

function FaceView({
  visual,
  face,
  gate,
}: {
  readonly visual: ModelVisualProps;
  readonly face: Exclude<ModelFace, { readonly kind: 'empty' }>;
  readonly gate: FaceGate;
}): ReactNode {
  const { source, view, px, signals, overlay } = visual;
  const { spec } = source;
  const { moving } = gate;
  const layerSignals = faceSignals(spec, face, signals);
  const playing = moving && faceMoves(spec, view, face, layerSignals);
  const clock = usePlayClock(playing);
  if (face.kind === 'clip') {
    const rate = clipRate(spec, layerSignals);
    return <ClipAtlas clip={face.clip} clock={clock} playing={playing} rate={rate} />;
  }
  const heldS = activeShot(spec.shots, signals)?.stillAt ?? 0;
  return (
    <>
      <LayerStack
        spec={spec}
        view={view}
        image={face.image}
        signals={layerSignals}
        timing={{ clock, playing, heldS }}
      />
      {overlay === undefined ? null : overlay({ spec, anchors: face.image.anchors, gate, px })}
    </>
  );
}

export function ModelVisual(props: ModelVisualProps): ReactNode {
  const { source, px, signals } = props;
  const ref = useRef<View>(null);
  const { visible, onLayout } = useOnScreen(ref);
  const gate = useAnimationGate(isFunctioning(source.spec, signals), visible);
  const { face, landed } = useModelFace(props, visible);
  const level = useFade(landed, gate.reduced || landed?.instant === true);
  const modelStyle = useAnimatedStyle(() => ({ opacity: level.get() }));
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={square(px)}
    >
      {visible && face.kind !== 'empty' ? (
        <Animated.View className="absolute inset-0" style={modelStyle}>
          <FaceView visual={props} face={face} gate={gate} />
        </Animated.View>
      ) : null}
    </View>
  );
}

export function faceSignals(spec: ModelSpec, face: ModelFace, live: ChannelSignals): LayerSignals {
  if (face.kind === 'clip') return { live, baked: shotSignals(spec, face.clip.shotId) };
  const state = stillState(spec, live);
  return { live, baked: state === null ? {} : (spec.states?.[state] ?? {}) };
}

export function faceMoves(
  spec: ModelSpec,
  view: BakeView,
  face: ModelFace,
  signals: LayerSignals,
): boolean {
  if (face.kind === 'clip') return true;
  return face.kind === 'layers' && stackMoves(spec, view, face.image, signals);
}
