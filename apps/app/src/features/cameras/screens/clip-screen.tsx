import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { RecordingRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Skeleton } from '../../../components/skeleton';
import { joinParts } from '../../../format/text';
import { duration, moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useRow, useSettings } from '../../../store/selectors';
import { openClip } from '../data/save-clip';
import { useDeleteWithUndo } from '../data/delete-recordings';
import { useCameraEntry, useCameraRecordings, useRecording } from '../data/use-cameras';
import { useRecordingLinks } from '../data/use-media-links';
import { eventLook } from '../../activity';
import { ClipSurface } from '../player/video-surface';

function Picture({
  recording,
  label,
}: {
  readonly recording: RecordingRow;
  readonly label: string;
}): ReactNode {
  const links = useRecordingLinks([recording.id], 'full');
  const url = links.data?.[recording.id]?.url ?? null;
  if (links.error !== null) {
    return (
      <ErrorState
        error={links.error}
        retry={() => {
          void links.refetch();
        }}
      />
    );
  }
  if (url === null) {
    return <Skeleton shape="block" className="h-full w-full" />;
  }
  return recording.kind === 'clip' ? (
    <ClipSurface uri={url} label={label} />
  ) : (
    <Image
      source={{ uri: url }}
      accessibilityLabel={label}
      resizeMode="contain"
      className="h-full w-full"
    />
  );
}

function useNeighbours(recording: RecordingRow): {
  readonly older: RecordingRow | null;
  readonly newer: RecordingRow | null;
} {
  const all = useCameraRecordings([recording.device_id]);
  const clipped = new Set(
    all.flatMap((row) => (row.kind === 'clip' && row.event_id !== null ? [row.event_id] : [])),
  );
  const shown = all.filter(
    (row) => row.kind === 'clip' || row.event_id === null || !clipped.has(row.event_id),
  );
  const index = shown.findIndex((row) => row.id === recording.id);
  return { newer: shown[index - 1] ?? null, older: shown[index + 1] ?? null };
}

function saveClip(recordingUrl: string | null): void {
  if (recordingUrl !== null) {
    openClip(recordingUrl);
  }
}

function StepButton({
  label,
  icon,
  target,
}: {
  readonly label: string;
  readonly icon: 'chevronLeft' | 'chevronRight';
  readonly target: RecordingRow | null;
}): ReactNode {
  const router = useRouter();
  return (
    <Button
      label={label}
      icon={icon}
      variant="tonal"
      disabled={target === null}
      onPress={() => {
        if (target !== null) {
          router.replace(href.clip(target.device_id, target.id));
        }
      }}
    />
  );
}

function ClipActions({ recording }: { readonly recording: RecordingRow }): ReactNode {
  const router = useRouter();
  const deleting = useDeleteWithUndo();
  const links = useRecordingLinks([recording.id], 'full');
  const { older, newer } = useNeighbours(recording);
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <StepButton label="Newer" icon="chevronLeft" target={newer} />
      <StepButton label="Older" icon="chevronRight" target={older} />
      <View className="flex-1" />
      <Button
        label="Save"
        icon="download"
        variant="tonal"
        disabled={links.data === undefined}
        onPress={() => {
          saveClip(links.data?.[recording.id]?.url ?? null);
        }}
      />
      <Button
        label="Delete"
        icon="trash"
        variant="destructive"
        onPress={() => {
          deleting.remove(
            recording.id,
            recording.event_id === null
              ? { eventIds: [], recordingIds: [recording.id] }
              : { eventIds: [recording.event_id], recordingIds: [] },
            recording.event_id === null ? 'Recording' : 'Event',
          );
          router.back();
        }}
      />
    </View>
  );
}

function ClipView({
  recording,
  cameraName,
}: {
  readonly recording: RecordingRow;
  readonly cameraName: string;
}): ReactNode {
  const event = useRow('events', recording.event_id);
  const timeZone = useSettings().time_zone;
  const now = useMinute();
  const what =
    event === null
      ? recording.kind === 'clip'
        ? 'Clip'
        : 'Snapshot'
      : eventLook(event.kind, event.details).label;
  const subtitle = joinParts([
    cameraName,
    moment(recording.started_at, now, timeZone),
    recording.duration_ms === null ? null : duration(recording.duration_ms / 1000),
  ]);
  return (
    <Screen header={<PageHeader title={what} subtitle={subtitle} />} maxWidth="detail">
      <View className="aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-black">
        <Picture recording={recording} label={`${what} from ${cameraName}`} />
      </View>
      <ClipActions recording={recording} />
    </Screen>
  );
}

export function ClipScreen(): ReactNode {
  const { cameraId, recordingId } = useLocalSearchParams<{
    cameraId: string;
    recordingId: string;
  }>();
  const recording = useRecording(recordingId);
  const entry = useCameraEntry(cameraId);
  if (recording === null || entry === null) {
    return (
      <Screen header={<PageHeader title="Clip" />} maxWidth="reading">
        <EmptyState
          icon="film"
          title="This clip isn’t here any more"
          body="It may have been deleted, or it’s older than what your server keeps on hand."
          action={<Button label="All events" href={href.cameraEvents()} />}
        />
      </Screen>
    );
  }
  return <ClipView recording={recording} cameraName={entry.name} />;
}
