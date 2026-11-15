import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { useEventListener } from 'expo';
import type * as ExpoVideo from 'expo-video';
import {
  Easing,
  cancelAnimation,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Logger, background } from '@smarteverything/logging';
import { Interactive } from '../../../components/interactive';
import { isNative } from '../../../design/platform';
import { useModulePlayer, usePlaybackLive, useSpaceToggle, type VideoModule } from './live-photo';
import {
  BigPlay,
  FRAME_WIDTH,
  VideoControls,
  type ControlsState,
  type FrameAt,
} from './video-scrubber';

const log = new Logger('app.photos');

type Player = ExpoVideo.VideoPlayer;

const TIME_EVENT_S = 1;

function setUp(created: Player): void {
  const player = created;
  player.timeUpdateEventInterval = TIME_EVENT_S;
}

function moveTo(target: Player, seconds: number): void {
  const player = target;
  player.currentTime = seconds;
}

function flipMuted(target: Player): void {
  const player = target;
  player.muted = !player.muted;
}

interface PlayerState extends ControlsState {
  readonly failed: boolean;
  readonly setScrubbing: (on: boolean) => void;
}

type Anchor = (seconds: number, playing: boolean) => void;

function useAnchor(player: Player, position: SharedValue<number>, scrubbing: boolean): Anchor {
  return (seconds: number, playing: boolean): void => {
    if (scrubbing) return;
    cancelAnimation(position);
    position.set(seconds);
    const left = (player.duration - seconds) / Math.max(player.playbackRate, Number.EPSILON);
    if (!playing || left <= 0) return;
    position.set(withTiming(player.duration, { duration: left * 1000, easing: Easing.linear }));
  };
}

function useIntent(
  player: Player,
  live: boolean,
): {
  readonly setWanted: (wanted: boolean) => void;
} {
  const wanted = useRef(true);
  useEffect(() => {
    if (live && wanted.current) player.play();
    else player.pause();
  }, [player, live]);
  useEventListener(player, 'playToEnd', () => {
    wanted.current = false;
  });
  return {
    setWanted: (next: boolean): void => {
      wanted.current = next;
    },
  };
}

interface Clock {
  readonly second: number;
  readonly duration: number;
  readonly buffered: number;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly failed: boolean;
  readonly setSecond: (second: number) => void;
}

function usePlayerClock(player: Player, fallback: number, anchor: Anchor): Clock {
  const [second, setSecond] = useState(0);
  const [duration, setDuration] = useState(fallback);
  const [buffered, setBuffered] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(player.muted);
  const [failed, setFailed] = useState(false);
  useEventListener(player, 'sourceLoad', (event) => {
    setDuration(event.duration);
  });
  useEventListener(player, 'timeUpdate', (event) => {
    setSecond(Math.floor(event.currentTime));
    setBuffered(event.bufferedPosition);
    anchor(event.currentTime, player.playing);
  });
  useEventListener(player, 'playingChange', (event) => {
    setPlaying(event.isPlaying);
    anchor(player.currentTime, event.isPlaying);
  });
  useEventListener(player, 'mutedChange', (event) => {
    setMuted(event.muted);
  });
  useEventListener(player, 'statusChange', (event) => {
    if (event.status !== 'error') return;
    log.warn('viewer.video_failed', { reason: event.error?.message ?? 'unknown' });
    setFailed(true);
  });
  return { second, duration, buffered, playing, muted, failed, setSecond };
}

export function togglePlayback(
  player: Pick<Player, 'playing' | 'currentTime' | 'duration' | 'play' | 'pause'>,
  seek: (seconds: number) => void,
): boolean {
  const wanted = !player.playing;
  if (wanted && player.currentTime >= player.duration) seek(0);
  if (wanted) player.play();
  else player.pause();
  return wanted;
}

function usePlayerState(player: Player, fallback: number, live: boolean): PlayerState {
  const position = useSharedValue(0);
  const [scrubbing, setScrubbing] = useState(false);
  const intent = useIntent(player, live);
  const clock = usePlayerClock(player, fallback, useAnchor(player, position, scrubbing));
  const seek = (seconds: number): void => {
    moveTo(player, seconds);
    clock.setSecond(Math.floor(seconds));
    position.set(seconds);
  };
  const toggle = (): void => {
    intent.setWanted(togglePlayback(player, seek));
  };
  return { ...clock, position, scrubbing, toggle, seek, setScrubbing };
}

function framesOf(player: Player, phone: boolean): FrameAt | null {
  if (!phone || !isNative()) return null;
  const maxWidth = PixelRatio.getPixelSizeForLayoutSize(FRAME_WIDTH);
  return (seconds) =>
    player.generateThumbnailsAsync(seconds, { maxWidth }).then((frames) => frames[0] ?? null);
}

function Surface({
  module,
  player,
  state,
  phone,
  view,
}: {
  readonly module: VideoModule;
  readonly player: Player;
  readonly state: PlayerState;
  readonly phone: boolean;
  readonly view: RefObject<InstanceType<VideoModule['VideoView']> | null>;
}): ReactNode {
  const { VideoView } = module;
  return (
    <View className="min-h-0 flex-1">
      <Interactive
        label={state.playing ? 'Pause' : 'Play'}
        onPress={state.toggle}
        className="flex-1"
      >
        <VideoView
          ref={view}
          player={player}
          nativeControls={false}
          contentFit="contain"
          fullscreenOptions={{ enable: true }}
          style={StyleSheet.absoluteFill}
        />
      </Interactive>
      {state.playing || state.scrubbing ? null : <BigPlay phone={phone} onPress={state.toggle} />}
    </View>
  );
}

export interface PlayerViewProps {
  readonly module: VideoModule;
  readonly source: string;
  readonly phone: boolean;
  readonly lengthSeconds: number;
  readonly failed: ReactNode;
  readonly onScrubbing: (on: boolean) => void;
}

export function PlayerView(props: PlayerViewProps): ReactNode {
  const { module, phone } = props;
  const player = useModulePlayer(module, props.source, setUp);
  const live = usePlaybackLive();
  const state = usePlayerState(player, props.lengthSeconds, live);
  const view = useRef<InstanceType<VideoModule['VideoView']>>(null);
  useSpaceToggle(live, state.toggle);
  if (state.failed) return props.failed;
  return (
    <View className="flex-1">
      <Surface module={module} player={player} state={state} phone={phone} view={view} />
      <VideoControls
        state={state}
        phone={phone}
        frameAt={framesOf(player, phone)}
        onScrubbing={(on) => {
          state.setScrubbing(on);
          props.onScrubbing(on);
        }}
        onMute={() => {
          flipMuted(player);
        }}
        onFullscreen={() => {
          background(view.current?.enterFullscreen(), 'photos.viewer.fullscreen_failed');
        }}
      />
    </View>
  );
}
