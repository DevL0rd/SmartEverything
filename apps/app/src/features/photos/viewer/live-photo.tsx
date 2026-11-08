import type { ReactNode } from 'react';
import { useEffect, useEffectEvent, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useEventListener } from 'expo';
import type * as ExpoVideo from 'expo-video';
import { Logger } from '@smarteverything/logging';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useScreenLive } from '../../../design/animation-gate';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { keyPressOf, type KeyPress } from '../../../design/keyboard';
import { isNative } from '../../../design/platform';
import { useScopeVisible } from '../../../design/visibility';

const log = new Logger('app.photos');

export type VideoModule = typeof ExpoVideo;
type Player = ExpoVideo.VideoPlayer;
type ModuleState = VideoModule | 'failed' | null;

let loading: Promise<VideoModule> | null = null;

export type HoldChange = 'start' | 'stop';

const RING_SIZE = 80;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function loadVideoModule(): Promise<VideoModule> {
  loading ??= import('expo-video');
  return loading;
}

export function useVideoModule(available: boolean): ModuleState {
  const [module, setModule] = useState<ModuleState>(null);
  useEffect(() => {
    if (!available) return undefined;
    let current = true;
    loadVideoModule()
      .then((loaded) => {
        if (current) setModule(loaded);
      })
      .catch((error: unknown) => {
        log.error('viewer.video_module_failed', error);
        if (current) setModule('failed');
      });
    return (): void => {
      current = false;
    };
  }, [available]);
  return available ? module : 'failed';
}

export function usePlaybackLive(): boolean {
  const visible = useScopeVisible();
  const { focused, foreground } = useScreenLive();
  return visible && focused && foreground;
}

export function isSpace(press: KeyPress): boolean {
  return press.key === ' ' && !press.typing && !press.command && !press.alt;
}

export function useSpaceToggle(active: boolean, toggle: () => void): void {
  const handle = useEffectEvent((event: KeyboardEvent): void => {
    if (!isSpace(keyPressOf(event))) return;
    event.preventDefault();
    if (!event.repeat) toggle();
  });
  useEffect(() => {
    if (!active || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      handle(event);
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [active]);
}

export function holdChangeOf(
  type: 'keydown' | 'keyup',
  press: KeyPress,
  repeat: boolean,
): HoldChange | null {
  if (!isSpace(press)) return null;
  if (type === 'keyup') return 'stop';
  return repeat ? null : 'start';
}

export function clipLength(seconds: number): string {
  return `${(Math.round(seconds * 10) / 10).toFixed(1)} s`;
}

export function liveBadgeText(playing: boolean, seconds: number, phone: boolean): string {
  if (playing) return seconds > 0 ? `PLAYING LIVE · ${clipLength(seconds)}` : 'PLAYING LIVE';
  return phone ? 'LIVE · press and hold' : 'LIVE · hold to play';
}

function useSpaceHold(active: boolean, onChange: (held: boolean) => void): void {
  const handle = useEffectEvent((event: KeyboardEvent): void => {
    const type = event.type === 'keyup' ? 'keyup' : 'keydown';
    const change = holdChangeOf(type, keyPressOf(event), event.repeat);
    if (change === null) return;
    event.preventDefault();
    onChange(change === 'start');
  });
  const release = useEffectEvent((): void => {
    onChange(false);
  });
  useEffect(() => {
    if (!active || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      handle(event);
    };
    const blur = (): void => {
      release();
    };
    document.addEventListener('keydown', listen);
    document.addEventListener('keyup', listen);
    window.addEventListener('blur', blur);
    return (): void => {
      document.removeEventListener('keydown', listen);
      document.removeEventListener('keyup', listen);
      window.removeEventListener('blur', blur);
    };
  }, [active]);
}

function rewind(target: Player): void {
  const player = target;
  player.pause();
  player.currentTime = 0;
}

function Ring({ progress }: { readonly progress: SharedValue<number> }): ReactNode {
  const stroke = useColour('primary');
  const track = useColour('on-surface');
  const drawn = useAnimatedProps(() => ({
    strokeDashoffset: RING_LENGTH * (1 - progress.get()),
  }));
  const centre = RING_SIZE / 2;
  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 items-center justify-center"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="size-20 items-center justify-center">
        <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
          <Circle
            cx={centre}
            cy={centre}
            r={RING_RADIUS}
            fill="none"
            stroke={track}
            strokeOpacity={0.7}
            strokeWidth={RING_STROKE}
          />
          <AnimatedCircle
            cx={centre}
            cy={centre}
            r={RING_RADIUS}
            fill="none"
            stroke={stroke}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${String(RING_LENGTH)} ${String(RING_LENGTH)}`}
            transform={`rotate(-90 ${String(centre)} ${String(centre)})`}
            animatedProps={drawn}
          />
        </Svg>
        <Icon name="radio" size={24} tone="default" />
      </View>
    </View>
  );
}

function useClip(
  player: Player,
  held: boolean,
): {
  readonly playing: boolean;
  readonly seconds: number;
  readonly progress: SharedValue<number>;
} {
  const progress = useSharedValue(0);
  const [playing, setPlaying] = useState(false);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (held) player.play();
    else rewind(player);
  }, [player, held]);
  useEventListener(player, 'sourceLoad', (event) => {
    setSeconds(event.duration);
  });
  useEventListener(player, 'playingChange', (event) => {
    setPlaying(event.isPlaying);
    cancelAnimation(progress);
    if (!event.isPlaying) {
      progress.set(0);
      return;
    }
    const left = Math.max(0, player.duration - player.currentTime);
    progress.set(withTiming(1, { duration: left * 1000, easing: Easing.linear }));
  });
  return { playing, seconds, progress };
}

function Clip({
  module,
  clip,
  held,
  phone,
}: {
  readonly module: VideoModule;
  readonly clip: string;
  readonly held: boolean;
  readonly phone: boolean;
}): ReactNode {
  const player = module.useVideoPlayer({ uri: clip, contentType: 'progressive' });
  const state = useClip(player, held);
  const { VideoView } = module;
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <View className={state.playing ? 'flex-1 opacity-100' : 'flex-1 opacity-0'}>
        <VideoView
          player={player}
          nativeControls={false}
          contentFit="contain"
          style={StyleSheet.absoluteFill}
        />
      </View>
      {state.playing ? <Ring progress={state.progress} /> : null}
      <LiveBadge text={liveBadgeText(state.playing, state.seconds, phone)} phone={phone} />
    </View>
  );
}

export function LiveBadge({
  text,
  phone,
}: {
  readonly text: string;
  readonly phone: boolean;
}): ReactNode {
  return (
    <View
      pointerEvents="none"
      className={cn(
        'absolute flex-row items-center gap-1 rounded-full bg-black/50 px-2 py-0.5',
        phone ? 'bottom-3 self-center' : 'left-3 top-3',
      )}
    >
      <Icon name="radio" size={16} tone="default" />
      <Text variant="caption" className="tabular-nums">
        {text}
      </Text>
    </View>
  );
}

export interface LivePhotoProps {
  readonly clip: string | null;
  readonly available: boolean;
  readonly phone: boolean;
  readonly children: ReactNode;
}

export function LivePhoto({ clip, available, phone, children }: LivePhotoProps): ReactNode {
  const module = useVideoModule(available);
  const live = usePlaybackLive();
  const [held, setHeld] = useState(false);
  const holding = held && live;
  useSpaceHold(live, setHeld);
  const press = Gesture.LongPress()
    .runOnJS(true)
    .onStart(() => {
      setHeld(true);
    })
    .onFinalize(() => {
      setHeld(false);
    });
  const ready = module !== null && module !== 'failed' && clip !== null && live;
  return (
    <GestureDetector gesture={press}>
      <View className="size-full">
        {children}
        {ready ? (
          <Clip module={module} clip={clip} held={holding} phone={phone} />
        ) : (
          <LiveBadge text="LIVE" phone={phone} />
        )}
      </View>
    </GestureDetector>
  );
}
