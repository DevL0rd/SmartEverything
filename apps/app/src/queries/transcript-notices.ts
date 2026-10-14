import type { QueryClient } from '@tanstack/react-query';
import type { TranscriptChangedNotice, LiveChange } from '@smarteverything/domain';
import { TRANSCRIPT_READER_PREFIX, TRANSCRIPT_SOURCE_PREFIX } from '../components/transcript-feed';
import { transcriptKeys } from './keys';

export function receiveTranscriptNotice(
  client: QueryClient,
  notice: TranscriptChangedNotice,
): void {
  const scope = notice.source === 'camera' ? notice.source_id : notice.plugin_id;
  if (scope === null) return;
  void client.invalidateQueries({
    queryKey: TRANSCRIPT_SOURCE_PREFIX,
    predicate: (query) => query.queryKey[2] === notice.source && query.queryKey[3] === scope,
  });
  void client.invalidateQueries({
    queryKey: TRANSCRIPT_READER_PREFIX,
    predicate: (query) =>
      query.queryKey[2] === notice.source &&
      (query.queryKey[3] === scope || (notice.source === 'camera' && query.queryKey[3] === 'all')),
  });
}

export function refreshTranscriptReaders(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: TRANSCRIPT_READER_PREFIX });
  void client.invalidateQueries({ queryKey: TRANSCRIPT_SOURCE_PREFIX });
  void client.invalidateQueries({ queryKey: transcriptKeys.status() });
}

export function transcriptCameraChanges(client: QueryClient, changes: readonly LiveChange[]): void {
  const cameras = changes.filter((change) => change.table === 'cameras');
  if (cameras.length === 0) return;
  void client.invalidateQueries({ queryKey: transcriptKeys.status() });
  if (cameras.some((change) => change.operation === 'INSERT' || change.operation === 'DELETE')) {
    void client.resetQueries({
      queryKey: TRANSCRIPT_READER_PREFIX,
      predicate: (query) => query.queryKey[2] === 'camera',
    });
  }
}
