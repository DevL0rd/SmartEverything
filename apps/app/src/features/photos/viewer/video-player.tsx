import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import type { MediaInfo, PhotosProgressNotice } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Arc } from '../../../components/charts/arc';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { percent } from '../../../format/number';
import { onPhotosProgress, useDriveLink } from '../../drive';
import { photoKeys } from '../data/keys';
import type { MediaItem } from './info-model';
import { SaveToDeviceButton } from './save-button';
import { useVideoModule, type VideoModule } from './live-photo';
import { PlayerView } from './player-view';
import { IdleControls } from './video-scrubber';

type VideoItem = Extract<MediaItem, { readonly kind: 'video' }>;

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
      <SaveToDeviceButton itemId={item.id} variant="tonal" />
    </View>
  );
}

export interface ViewerVideoProps {
  readonly item: VideoItem;
  readonly media: MediaInfo | null;
  readonly source: string | null;
  readonly available: boolean;
  readonly phone: boolean;
  readonly onScrubbing: (on: boolean) => void;
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
  const { item, phone } = video;
  return (
    <PlayerView
      module={module}
      source={source}
      phone={phone}
      lengthSeconds={lengthOf(item)}
      failed={<Notice item={item} look="failed" share={0} phone={phone} />}
      onScrubbing={video.onScrubbing}
    />
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
