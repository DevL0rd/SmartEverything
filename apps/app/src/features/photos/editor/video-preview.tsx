import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { useEventListener } from 'expo';
import type * as ExpoVideo from 'expo-video';
import { Logger } from '@smarteverything/logging';
import { IconButton } from '../../../components/icon-button';
import { isNative } from '../../../design/platform';
import type { VideoModule } from '../viewer/live-photo';
import type { FrameSource } from './trim-bar';
import { frameTimes, type Trim } from './trim-model';

const log = new Logger('app.photos');

type Player = ExpoVideo.VideoPlayer;

export const FRAME_PX = 64;

function setUp(created: Player): void {
  const player = created;
  player.timeUpdateEventInterval = 0.1;
  player.loop = false;
}

export function seekTo(target: Player, ms: number): void {
  const player = target;
  player.currentTime = ms / 1000;
}

function useNativeFrames(
  player: Player,
  count: number,
  durationMs: number,
): readonly FrameSource[] {
  const [frames, setFrames] = useState<readonly FrameSource[]>([]);
  useEffect(() => {
    if (!isNative() || count === 0) return undefined;
    let current = true;
    const times = frameTimes(count, durationMs).map((ms) => ms / 1000);
    player
      .generateThumbnailsAsync(times, { maxWidth: PixelRatio.getPixelSizeForLayoutSize(FRAME_PX) })
      .then((made) => {
        if (current) setFrames(made);
      })
      .catch((error: unknown) => {
        log.warn('editor.video_frames_failed', { reason: String(error) });
      });
    return (): void => {
      current = false;
    };
  }, [player, count, durationMs]);
  return frames;
}

export interface VideoPreviewProps {
  readonly module: VideoModule;
  readonly uri: string;
  readonly trim: Trim;
  readonly frameCount: number;
  readonly seekMs: number | null;
  readonly onTime: (ms: number) => void;
  readonly onFrames: (frames: readonly FrameSource[]) => void;
}

function usePlayback(player: Player, props: VideoPreviewProps): boolean {
  const [playing, setPlaying] = useState(false);
  useEventListener(player, 'playingChange', (event) => {
    setPlaying(event.isPlaying);
  });
  useEventListener(player, 'timeUpdate', (event) => {
    const ms = event.currentTime * 1000;
    props.onTime(ms);
    if (ms >= props.trim.endMs && player.playing) {
      player.pause();
      seekTo(player, props.trim.startMs);
    }
  });
  useEffect(() => {
    if (props.seekMs === null) return;
    player.pause();
    seekTo(player, props.seekMs);
  }, [player, props.seekMs]);
  return playing;
}

export function VideoPreview(props: VideoPreviewProps): ReactNode {
  const { VideoView } = props.module;
  const player = props.module.useVideoPlayer({ uri: props.uri, contentType: 'progressive' }, setUp);
  const playing = usePlayback(player, props);
  const frames = useNativeFrames(player, props.frameCount, props.trim.durationMs);
  const { onFrames } = props;
  useEffect(() => {
    if (frames.length > 0) onFrames(frames);
  }, [frames, onFrames]);
  return (
    <View className="min-h-0 flex-1">
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="contain"
        style={StyleSheet.absoluteFill}
      />
      <View className="absolute bottom-3 left-0 right-0 items-center">
        <IconButton
          icon={playing ? 'pause' : 'play'}
          label={playing ? 'Pause' : 'Play the trimmed part'}
          variant="overlay"
          onPress={() => {
            if (playing) {
              player.pause();
              return;
            }
            const at = player.currentTime * 1000;
            if (at < props.trim.startMs || at >= props.trim.endMs)
              seekTo(player, props.trim.startMs);
            player.play();
          }}
        />
      </View>
    </View>
  );
}
