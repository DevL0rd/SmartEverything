import type { ReactNode } from 'react';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { MediaInfo, PhotoSaveMode } from '@smarteverything/domain';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useEscape } from '../../../components/use-escape';
import { useMutationState } from '../../../store/mutation';
import { useDriveLink } from '../../drive';
import type { MediaItem } from '../viewer/info-model';
import { useVideoModule } from '../viewer/live-photo';
import { editPhotoVideo } from './api';
import { trackEditJob } from './queries';
import { TrimBar, type FrameSource } from './trim-bar';
import { frameCount, movedTrim, trimOf, trimSummary, videoEditOf, type Trim } from './trim-model';
import { EditorShell, SplitSave } from './top-bar';
import { closeEditor, useLeave, useLeaveHandler } from './use-photo-editor';
import { FRAME_PX, VideoPreview } from './video-preview';

export interface VideoEditorProps {
  readonly item: MediaItem;
  readonly media: MediaInfo | null;
}

function usePlayable(item: MediaItem, media: MediaInfo | null): string | null {
  return useDriveLink(media?.playable.state === 'ready' ? item.id : null, item.rev, 'playable');
}

function useSave(item: MediaItem): {
  readonly busy: boolean;
  readonly save: (trim: Trim, stabilize: boolean, mode: PhotoSaveMode) => void;
} {
  const mutation = useMutationState();
  return {
    busy: mutation.busy,
    save: (trim, stabilize, mode): void => {
      const body = videoEditOf(trim, stabilize, mode);
      if (body === null) return;
      mutation.run(() => editPhotoVideo(item.id, body), {
        failure: 'The video edit did not start',
        label: 'video_edit',
        onDone: (started) => {
          trackEditJob(item.id, started.jobId);
          notify({ message: 'Saving the edited video. You can keep using the app.' });
          closeEditor(item.id);
        },
      });
    },
  };
}

function Poster({ item }: { readonly item: MediaItem }): ReactNode {
  const uri = useDriveLink(item.id, item.rev, 'preview');
  return (
    <View className="min-h-0 flex-1">
      <Image
        source={uri === null ? null : { uri }}
        contentFit="contain"
        style={StyleSheet.absoluteFill}
        accessibilityLabel={item.name}
      />
    </View>
  );
}

interface Draft {
  readonly trim: Trim;
  readonly stabilize: boolean;
  readonly playheadMs: number;
  readonly seekMs: number | null;
  readonly barWidth: number;
  readonly frames: readonly FrameSource[];
}

type Change = (change: (draft: Draft) => Draft) => void;

function useDraft(item: MediaItem): readonly [Draft, Change] {
  const [draft, setDraft] = useState<Draft>(() => ({
    trim: trimOf(item.kind === 'video' ? (item.durationMs ?? 0) : 0),
    stabilize: false,
    playheadMs: 0,
    seekMs: null,
    barWidth: 0,
    frames: [],
  }));
  return [draft, setDraft];
}

function Stage({
  video,
  draft,
  change,
}: {
  readonly video: VideoEditorProps;
  readonly draft: Draft;
  readonly change: Change;
}): ReactNode {
  const module = useVideoModule(true);
  const uri = usePlayable(video.item, video.media);
  if (module === null || module === 'failed' || uri === null) return <Poster item={video.item} />;
  return (
    <VideoPreview
      module={module}
      uri={uri}
      trim={draft.trim}
      frameCount={frameCount(draft.barWidth, FRAME_PX)}
      seekMs={draft.seekMs}
      onTime={(ms) => {
        change((current) => ({ ...current, playheadMs: ms }));
      }}
      onFrames={(frames) => {
        change((current) => ({ ...current, frames }));
      }}
    />
  );
}

function useFallbackFrames(item: MediaItem, draft: Draft): readonly FrameSource[] {
  const poster = useDriveLink(item.id, item.rev, 'thumb');
  if (draft.frames.length > 0 || poster === null) return draft.frames;
  return Array.from({ length: frameCount(draft.barWidth, FRAME_PX) }, () => ({ uri: poster }));
}

function SaveControl({
  draft,
  saving,
}: {
  readonly draft: Draft;
  readonly saving: ReturnType<typeof useSave>;
}): ReactNode {
  const nothing = videoEditOf(draft.trim, draft.stabilize, 'version') === null;
  return (
    <SplitSave
      label="Save"
      saving={saving.busy}
      disabled={nothing}
      more={[
        {
          label: 'Save as copy',
          description: 'Keeps this video as it is',
          icon: 'copy',
          onPress: (): void => {
            saving.save(draft.trim, draft.stabilize, 'copy');
          },
        },
      ]}
      onSave={() => {
        saving.save(draft.trim, draft.stabilize, 'version');
      }}
    />
  );
}

function StabilizeRow({
  draft,
  change,
}: {
  readonly draft: Draft;
  readonly change: Change;
}): ReactNode {
  return (
    <View className="mx-4 flex-row items-center gap-3 rounded-lg bg-surface-2 px-4 py-3">
      <View className="min-w-0 flex-1">
        <Text variant="label">Stabilize</Text>
        <Text variant="footnote" tone="variant">
          Smooths shaky footage. The hub works on it in the background.
        </Text>
      </View>
      <Switch
        label="Stabilize"
        value={draft.stabilize}
        onChange={(stabilize) => {
          change((current) => ({ ...current, stabilize }));
        }}
      />
    </View>
  );
}

export function VideoEditorView(props: VideoEditorProps): ReactNode {
  const [draft, change] = useDraft(props.item);
  const saving = useSave(props.item);
  const frames = useFallbackFrames(props.item, draft);
  const edited = videoEditOf(draft.trim, draft.stabilize, 'version') !== null;
  const leave = useLeave(props.item.id, edited, 'The video stays as it was.');
  useEscape(true, leave);
  useLeaveHandler(leave);
  return (
    <View className="flex-1 bg-black">
      <EditorShell
        title={props.item.name}
        onCancel={leave}
        trailing={<SaveControl draft={draft} saving={saving} />}
      >
        <VideoBody video={props} draft={draft} change={change} frames={frames} />
      </EditorShell>
    </View>
  );
}

function VideoBody({
  video,
  draft,
  change,
  frames,
}: {
  readonly video: VideoEditorProps;
  readonly draft: Draft;
  readonly change: Change;
  readonly frames: readonly FrameSource[];
}): ReactNode {
  return (
    <>
      <Stage video={video} draft={draft} change={change} />
      <View className="gap-3 pb-safe-offset-3 pt-3">
        <TrimBar
          trim={draft.trim}
          playheadMs={draft.playheadMs}
          frames={frames}
          onWidth={(barWidth) => {
            change((current) => ({ ...current, barWidth }));
          }}
          onMove={(handle, ms) => {
            change((current) => {
              const trim = movedTrim(current.trim, handle, ms);
              return { ...current, trim, seekMs: handle === 'start' ? trim.startMs : trim.endMs };
            });
          }}
        />
        <Text variant="callout" tone="variant" align="center" className="tabular-nums">
          {trimSummary(draft.trim)}
        </Text>
        <StabilizeRow draft={draft} change={change} />
      </View>
    </>
  );
}
