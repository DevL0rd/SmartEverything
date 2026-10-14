import type { ReactNode, ReactElement } from 'react';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { TranscriptHit } from '@smarteverything/domain';
import { deleteTranscript } from '../../../api/transcripts';
import { confirm } from '../../../components/confirm-store';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { TranscriptFeed, TRANSCRIPT_READER_PREFIX } from '../../../components/transcript-feed';
import { useFeedController } from '../../../queries/transcript-reader/use-feed-controller';
import { useIsOwner, useSettings } from '../../../store/selectors';
import { cameraTranscriptPort } from '../data/camera-transcript-port';
import type { CameraEntry } from '../logic/cameras';
import { TranscribeRow } from './transcribe-row';

function useRemove(): ((hit: TranscriptHit) => void) | undefined {
  const owner = useIsOwner();
  const client = useQueryClient();
  if (!owner) return undefined;
  return (hit): void => {
    void (async (): Promise<void> => {
      const accepted = await confirm({
        title: 'Delete this transcript?',
        body: `All lines in “${hit.session.title}” are removed for good.`,
        confirmLabel: 'Delete',
        tone: 'destructive',
      });
      if (!accepted) return;
      try {
        await deleteTranscript(hit.session.id);
        await client.invalidateQueries({
          queryKey: TRANSCRIPT_READER_PREFIX,
          predicate: (query) =>
            query.queryKey[2] === 'camera' &&
            (query.queryKey[3] === 'all' || query.queryKey[3] === hit.session.source_id),
        });
      } catch (error) {
        notify({ message: 'The transcript wasn’t deleted', error, tone: 'critical' });
      }
    })();
  };
}

function CameraControls({ entry }: { readonly entry: CameraEntry | undefined }): ReactNode {
  if (entry?.camera === null || entry === undefined) return null;
  return (
    <List footer="Anyone who can view this camera can read its text. Audio is never kept. Listening pauses in privacy mode, offline, during a call and at the daily budget.">
      <TranscribeRow camera={entry.camera} />
    </List>
  );
}

export function CameraTranscriptFeed({
  entry,
  header,
  pageHeader,
  banner,
  maxWidth = 'dashboard',
}: {
  readonly entry?: CameraEntry;
  readonly header: ReactNode;
  readonly pageHeader?: ReactElement;
  readonly banner?: ReactNode;
  readonly maxWidth?: 'dashboard' | 'detail';
}): ReactNode {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const port = cameraTranscriptPort(entry?.device.id);
  const remove = useRemove();
  const focused = useIsFocused();
  const feed = useFeedController(port, focused);
  const { time_zone: timeZone } = useSettings();
  return (
    <TranscriptFeed
      feed={feed}
      timeZone={timeZone}
      {...(remove === undefined ? {} : { remove })}
      header={header}
      {...(pageHeader === undefined ? {} : { pageHeader })}
      banner={banner}
      controls={<CameraControls entry={entry} />}
      maxWidth={maxWidth}
      focus={focus === 'transcripts' || focus === 'transcript-search'}
      focusSearch={focus === 'transcript-search'}
    />
  );
}
