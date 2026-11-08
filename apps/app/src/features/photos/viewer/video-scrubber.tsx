import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { SharedRef } from 'expo';
import { Image } from 'expo-image';
import { Logger } from '@smarteverything/logging';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { playTime } from '../../../format/time';

const log = new Logger('app.photos');

export const SEEK_STEP_S = 10;
export const FRAME_WIDTH = 120;
const FRAME_HEIGHT = 68;
const TIME_WIDTH = 44;
const TIME_GAP = 8;
const TRACK_LEAD = TIME_WIDTH + TIME_GAP;

export type FrameImage = InstanceType<SharedRef<'image'>>;

export type FrameAt = (seconds: number) => Promise<FrameImage | null>;

export function shareOf(seconds: number, duration: number): number {
  'worklet';
  if (duration <= 0) return 0;
  return Math.min(1, Math.max(0, seconds / duration));
}

export function secondsAt(share: number, duration: number): number {
  'worklet';
  return Math.min(1, Math.max(0, share)) * Math.max(0, duration);
}

export function scrubLabel(seconds: number, duration: number): string {
  return `${playTime(seconds)} of ${playTime(duration)}`;
}

export function frameLeft(share: number, trackWidth: number, frameWidth: number): number {
  const centred = share * trackWidth - frameWidth / 2;
  return Math.min(Math.max(0, trackWidth - frameWidth), Math.max(0, centred));
}

export function steppedSeconds(seconds: number, duration: number, by: 1 | -1): number {
  return Math.min(Math.max(0, duration), Math.max(0, seconds + by * SEEK_STEP_S));
}

export interface VideoScrubberProps {
  readonly position: SharedValue<number>;
  readonly second: number;
  readonly duration: number;
  readonly buffered: number;
  readonly touch: boolean;
  readonly frameAt: FrameAt | null;
  readonly onScrubbing: (on: boolean) => void;
  readonly onSeek: (seconds: number) => void;
}

interface Frame {
  readonly at: number;
  readonly image: FrameImage | null;
}

interface Scrub {
  readonly gesture: ReturnType<typeof Gesture.Pan>;
  readonly width: SharedValue<number>;
  readonly trackWidth: number;
  readonly measure: (event: LayoutChangeEvent) => void;
  readonly held: number | null;
  readonly frame: Frame | null;
}

function useFrames(frameAt: FrameAt | null): {
  readonly frame: Frame | null;
  readonly show: (seconds: number | null) => void;
} {
  const [frame, setFrame] = useState<Frame | null>(null);
  const asked = useRef(0);
  const show = (seconds: number | null): void => {
    asked.current += 1;
    if (seconds === null || frameAt === null) {
      setFrame(null);
      return;
    }
    const ticket = asked.current;
    setFrame((now) => ({ at: seconds, image: now?.image ?? null }));
    frameAt(seconds)
      .then((image) => {
        if (asked.current === ticket) setFrame({ at: seconds, image });
      })
      .catch((error: unknown) => {
        log.warn('viewer.video_frame_failed', { reason: String(error) });
      });
  };
  return { frame, show };
}

function useScrub(props: VideoScrubberProps): Scrub {
  const { position, duration, onScrubbing, onSeek } = props;
  const width = useSharedValue(1);
  const last = useSharedValue(-1);
  const [trackWidth, setTrackWidth] = useState(0);
  const [held, setHeld] = useState<number | null>(null);
  const frames = useFrames(props.touch ? props.frameAt : null);
  const begin = (): void => {
    onScrubbing(true);
  };
  const preview = (seconds: number): void => {
    setHeld(seconds);
    frames.show(seconds);
  };
  const settle = (seconds: number): void => {
    setHeld(null);
    frames.show(null);
    onScrubbing(false);
    onSeek(seconds);
  };
  const move = (x: number): void => {
    'worklet';
    const seconds = secondsAt(x / Math.max(1, width.get()), duration);
    position.set(seconds);
    const whole = Math.floor(seconds);
    if (whole !== last.get()) {
      last.set(whole);
      scheduleOnRN(preview, whole);
    }
  };
  const gesture = Gesture.Pan()
    .minDistance(0)
    .enabled(duration > 0)
    .onBegin((event) => {
      scheduleOnRN(begin);
      move(event.x);
    })
    .onUpdate((event) => {
      move(event.x);
    })
    .onFinalize(() => {
      last.set(-1);
      scheduleOnRN(settle, position.get());
    });
  const measure = (event: LayoutChangeEvent): void => {
    width.set(event.nativeEvent.layout.width);
    setTrackWidth(event.nativeEvent.layout.width);
  };
  return { gesture, width, trackWidth, measure, held, frame: frames.frame };
}

function Played({
  position,
  duration,
}: {
  readonly position: SharedValue<number>;
  readonly duration: number;
}): ReactNode {
  const look = useAnimatedStyle(() => ({
    transformOrigin: 'left',
    transform: [{ scaleX: shareOf(position.get(), duration) }],
  }));
  return <Animated.View style={look} className="absolute inset-0 rounded-full bg-primary" />;
}

function Knob({
  position,
  duration,
  width,
  large,
}: {
  readonly position: SharedValue<number>;
  readonly duration: number;
  readonly width: SharedValue<number>;
  readonly large: boolean;
}): ReactNode {
  const half = large ? 10 : 7;
  const look = useAnimatedStyle(() => ({
    transform: [{ translateX: shareOf(position.get(), duration) * width.get() - half }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={look}
      className={cn('absolute left-0 rounded-full bg-white', large ? 'size-5' : 'size-3.5')}
    />
  );
}

function FramePreview({
  frame,
  left,
}: {
  readonly frame: Frame;
  readonly left: number;
}): ReactNode {
  const box = { left, width: FRAME_WIDTH, height: FRAME_HEIGHT };
  return (
    <View
      pointerEvents="none"
      style={box}
      className="absolute bottom-10 overflow-hidden rounded-md border-2 border-white bg-surface-2"
    >
      {frame.image === null ? null : (
        <Image source={frame.image} contentFit="cover" style={StyleSheet.absoluteFill} />
      )}
      <View className="absolute bottom-1 right-1 rounded-full bg-black/50 px-1.5">
        <Text variant="caption" className="tabular-nums">
          {playTime(frame.at)}
        </Text>
      </View>
    </View>
  );
}

function Track({
  bar,
  scrub,
}: {
  readonly bar: VideoScrubberProps;
  readonly scrub: Scrub;
}): ReactNode {
  const buffered: ViewStyle = { width: `${shareOf(bar.buffered, bar.duration) * 100}%` };
  return (
    <GestureDetector gesture={scrub.gesture} touchAction="none">
      <View onLayout={scrub.measure} className="h-11 min-w-0 flex-1 justify-center">
        <View className="h-1 rounded-full bg-white/20">
          <View style={buffered} className="absolute inset-y-0 left-0 rounded-full bg-white/35" />
          <Played position={bar.position} duration={bar.duration} />
        </View>
        <View pointerEvents="none" className="absolute inset-x-0 top-0 h-11 justify-center">
          <Knob
            position={bar.position}
            duration={bar.duration}
            width={scrub.width}
            large={bar.touch ? scrub.held !== null : false}
          />
        </View>
      </View>
    </GestureDetector>
  );
}

function Time({ seconds }: { readonly seconds: number }): ReactNode {
  return (
    <Text variant="caption" tone="variant" className="w-11 text-center tabular-nums">
      {playTime(seconds)}
    </Text>
  );
}

export function VideoScrubber(props: VideoScrubberProps): ReactNode {
  const scrub = useScrub(props);
  const now = scrub.held ?? props.second;
  const onAction = (event: AccessibilityActionEvent): void => {
    const by = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    props.onSeek(steppedSeconds(now, props.duration, by));
  };
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Position"
      accessibilityValue={{ text: scrubLabel(now, props.duration) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      className="min-w-0 flex-1 flex-row items-center gap-2"
    >
      <Time seconds={now} />
      <Track bar={props} scrub={scrub} />
      <Time seconds={props.duration} />
      {scrub.frame === null ? null : (
        <FramePreview
          frame={scrub.frame}
          left={
            TRACK_LEAD +
            frameLeft(shareOf(scrub.frame.at, props.duration), scrub.trackWidth, FRAME_WIDTH)
          }
        />
      )}
    </View>
  );
}

export interface ControlsState {
  readonly position: SharedValue<number>;
  readonly second: number;
  readonly duration: number;
  readonly buffered: number;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly scrubbing: boolean;
  readonly toggle: () => void;
  readonly seek: (seconds: number) => void;
}

export interface ControlsProps {
  readonly state: ControlsState;
  readonly phone: boolean;
  readonly frameAt: FrameAt | null;
  readonly onFullscreen: () => void;
  readonly onMute: () => void;
  readonly onScrubbing: (on: boolean) => void;
}

export function BigPlay({
  phone,
  onPress,
}: {
  readonly phone: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <View pointerEvents="box-none" className="absolute inset-0 items-center justify-center">
      <Interactive
        label="Play"
        onPress={onPress}
        className={cn(
          'items-center justify-center rounded-full bg-black/45',
          phone ? 'size-14' : 'size-16',
        )}
        layerClassName="rounded-full"
      >
        <Icon name="play" size={24} tone="default" />
      </Interactive>
    </View>
  );
}

function SideButtons({ controls }: { readonly controls: ControlsProps }): ReactNode {
  const { state } = controls;
  return (
    <View className={cn('flex-row', state.scrubbing ? 'opacity-30' : '')}>
      <IconButton
        icon={state.muted ? 'muted' : 'volume'}
        label={state.muted ? 'Unmute' : 'Mute'}
        onPress={controls.onMute}
      />
      <IconButton icon="maximize" label="Full screen" onPress={controls.onFullscreen} />
    </View>
  );
}

function barFrame(phone: boolean): string {
  return cn('flex-row items-center gap-2', phone ? 'px-3 pb-2' : 'px-1 pb-2 pt-2');
}

export function IdleControls({
  duration,
  phone,
}: {
  readonly duration: number;
  readonly phone: boolean;
}): ReactNode {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      className={cn(barFrame(phone), 'opacity-35')}
    >
      {phone ? null : <IconButton icon="play" label="Play" disabled />}
      <Time seconds={0} />
      <View className="h-11 min-w-0 flex-1 justify-center">
        <View className="h-1 rounded-full bg-white/20" />
      </View>
      <Time seconds={duration} />
      <IconButton icon="volume" label="Mute" disabled />
      <IconButton icon="maximize" label="Full screen" disabled />
    </View>
  );
}

export function VideoControls(controls: ControlsProps): ReactNode {
  const { state, phone } = controls;
  return (
    <View className={barFrame(phone)}>
      {phone ? null : (
        <View className={state.scrubbing ? 'opacity-30' : ''}>
          <IconButton
            icon={state.playing ? 'pause' : 'play'}
            label={state.playing ? 'Pause' : 'Play'}
            shortcut="Space"
            onPress={state.toggle}
          />
        </View>
      )}
      <VideoScrubber
        position={state.position}
        second={state.second}
        duration={state.duration}
        buffered={state.buffered}
        touch={phone}
        frameAt={controls.frameAt}
        onSeek={state.seek}
        onScrubbing={controls.onScrubbing}
      />
      <SideButtons controls={controls} />
    </View>
  );
}
