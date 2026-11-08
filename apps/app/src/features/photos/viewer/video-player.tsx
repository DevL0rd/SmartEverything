import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import type * as ExpoVideo from 'expo-video';
import {
  Easing,
  cancelAnimation,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { MediaInfo, PhotosProgressNotice } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Arc } from '../../../components/charts/arc';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { isNative } from '../../../design/platform';
import { percent } from '../../../format/number';
import { downloadFile } from '../../../platform/file-actions';
import { onPhotosProgress } from '../../nas/data/live';
import { useDriveLink } from '../../nas/data/links';
import { photoKeys } from '../data/keys';
import type { MediaItem } from './info-model';
import { usePlaybackLive, useSpaceToggle, useVideoModule, type VideoModule } from './live-photo';
import {
  BigPlay,
  FRAME_WIDTH,
  IdleControls,
  VideoControls,
  type ControlsState,
  type FrameAt,
} from './video-scrubber';

const log = new Logger('app.photos');

export const TIME_EVENT_S = 1;

type Player = ExpoVideo.VideoPlayer;
type VideoItem = Extract<MediaItem, { readonly kind: 'video' }>;

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

export interface PlayableProgress {
  readonly done: number;
  readonly total: number;
}

export function playableProgressOf(
  notice: PhotosProgressNotice,
  itemId: string,
): PlayableProgress | null {
  if (notice.kind !== 'playable' || notice.itemId !== itemId) return null;
  return { done: notice.done, total: notice.total };
}

export function playableShare(progress: PlayableProgress | null): number {
  if (progress === null || progress.total === 0) return 0;
  return progress.done / progress.total;
}

export type VideoLook = 'unavailable' | 'waiting' | 'preparing' | 'failed' | 'ready';

export function videoLookOf(
  available: boolean,
  media: MediaInfo | null,
  source: string | null,
): VideoLook {
  if (!available) return 'unavailable';
  if (media === null) return 'waiting';
  const { state } = media.playable;
  if (state === 'none' || state === 'processing') return 'preparing';
  if (state === 'failed' || state === 'unsupported') return 'failed';
  return source === null ? 'waiting' : 'ready';
}

export function followPlayable(
  client: QueryClient,
  itemId: string,
  onProgress: (progress: PlayableProgress) => void,
): () => void {
  return onPhotosProgress((notice) => {
    const next = playableProgressOf(notice, itemId);
    if (next === null) return;
    onProgress(next);
    background(
      client.invalidateQueries({ queryKey: photoKeys.media(itemId) }),
      'photos.viewer.playable_refresh_failed',
    );
  });
}

export function usePlayableProgress(itemId: string): PlayableProgress | null {
  const client = useQueryClient();
  const [heard, setHeard] = useState<{ readonly itemId: string; readonly at: PlayableProgress }>();
  useEffect(
    () =>
      followPlayable(client, itemId, (at) => {
        setHeard({ itemId, at });
      }),
    [client, itemId],
  );
  return heard?.itemId === itemId ? heard.at : null;
}

export const VIDEO_TEXT = {
  preparing: 'Preparing a playable copy',
  preparingBody: 'Plays here once the hub has made it. The original is kept as it is.',
  failed: 'This video cannot play here',
  failedBody: 'The hub could not make a playable copy. The original is kept as it is.',
  unavailable: 'Update the app to play videos here',
  unavailableBody: 'This version of the app cannot play videos. The original is kept as it is.',
} as const;

function DownloadOriginal({ item }: { readonly item: MediaItem }): ReactNode {
  const url = useDriveLink(item.id, item.rev, 'file');
  return (
    <Button
      label="Download original"
      icon="download"
      variant="tonal"
      disabled={url === null}
      onPress={() => {
        if (url !== null) downloadFile(url, item.name);
      }}
    />
  );
}

function Poster({ item }: { readonly item: MediaItem }): ReactNode {
  const url = useDriveLink(item.id, item.rev, 'preview');
  return (
    <Image
      source={url === null ? null : { uri: url }}
      contentFit="contain"
      cachePolicy="disk"
      style={StyleSheet.absoluteFill}
      accessibilityLabel={item.name}
    />
  );
}

function lengthOf(item: VideoItem): number {
  return item.durationMs === null ? 0 : item.durationMs / 1000;
}

interface NoticeProps {
  readonly item: VideoItem;
  readonly look: Exclude<VideoLook, 'ready'>;
  readonly share: number;
  readonly phone: boolean;
}

function Notice(props: NoticeProps): ReactNode {
  return (
    <View className="flex-1">
      <View className="min-h-0 flex-1">
        <Poster item={props.item} />
        {props.look === 'waiting' ? null : (
          <NoticeBody item={props.item} look={props.look} share={props.share} />
        )}
      </View>
      {props.look === 'preparing' ? (
        <IdleControls duration={lengthOf(props.item)} phone={props.phone} />
      ) : null}
    </View>
  );
}

function NoticeBody({
  item,
  look,
  share,
}: {
  readonly item: MediaItem;
  readonly look: Exclude<VideoLook, 'ready' | 'waiting'>;
  readonly share: number;
}): ReactNode {
  const title = VIDEO_TEXT[look];
  return (
    <View className="absolute inset-0 items-center justify-center gap-2.5 bg-black/55 px-6">
      {look === 'preparing' ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Preparing, ${percent(share)}`}
        >
          <Arc value={share} size={44} thickness={4} colour="primary" trackColour="surface-3" />
        </View>
      ) : (
        <Icon name={look === 'failed' ? 'alert' : 'film'} size={32} tone="variant" />
      )}
      <Text variant="label" align="center">
        {title}
      </Text>
      <Text variant="callout" tone="variant" align="center" className="max-w-reading">
        {VIDEO_TEXT[`${look}Body`]}
      </Text>
      <DownloadOriginal item={item} />
    </View>
  );
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

export interface ViewerVideoProps {
  readonly item: VideoItem;
  readonly media: MediaInfo | null;
  readonly source: string | null;
  readonly available: boolean;
  readonly phone: boolean;
  readonly onScrubbing: (on: boolean) => void;
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

function Playback({
  module,
  source,
  video,
}: {
  readonly module: VideoModule;
  readonly source: string;
  readonly video: ViewerVideoProps;
}): ReactNode {
  const player = module.useVideoPlayer({ uri: source, contentType: 'progressive' }, setUp);
  const live = usePlaybackLive();
  const { item, phone, onScrubbing } = video;
  const state = usePlayerState(player, lengthOf(item), live);
  const view = useRef<InstanceType<VideoModule['VideoView']>>(null);
  useSpaceToggle(live, state.toggle);
  if (state.failed) return <Notice item={item} look="failed" share={0} phone={phone} />;
  return (
    <View className="flex-1">
      <Surface module={module} player={player} state={state} phone={phone} view={view} />
      <VideoControls
        state={state}
        phone={phone}
        frameAt={framesOf(player, phone)}
        onScrubbing={(on) => {
          state.setScrubbing(on);
          onScrubbing(on);
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

export function ViewerVideo(props: ViewerVideoProps): ReactNode {
  const module = useVideoModule(props.available);
  const progress = usePlayableProgress(props.item.id);
  const look = videoLookOf(props.available && module !== 'failed', props.media, props.source);
  if (look !== 'ready' || module === null || module === 'failed' || props.source === null) {
    const shown = look === 'ready' ? 'waiting' : look;
    return (
      <Notice item={props.item} look={shown} share={playableShare(progress)} phone={props.phone} />
    );
  }
  return <Playback key={props.source} module={module} source={props.source} video={props} />;
}
