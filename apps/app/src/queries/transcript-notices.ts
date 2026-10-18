import type { QueryClient } from '@tanstack/react-query';
import type { LiveChange } from '@smarteverything/domain';
import {
  TRANSCRIPT_READER_PREFIX,
  TRANSCRIPT_SESSIONS_PREFIX,
} from './transcript-reader/selection';
import { transcriptKeys } from './keys';
import { background } from '@smarteverything/logging';

export function refreshTranscriptReaders(client: QueryClient): void {
  background(
    client.invalidateQueries({ queryKey: TRANSCRIPT_READER_PREFIX }),
    'queries.invalidate_failed',
  );
  background(
    client.invalidateQueries({ queryKey: TRANSCRIPT_SESSIONS_PREFIX }),
    'queries.invalidate_failed',
  );
  background(
    client.invalidateQueries({ queryKey: transcriptKeys.status() }),
    'queries.invalidate_failed',
  );
}

export function receiveTranscriptNotice(client: QueryClient): void {
  background(
    client.invalidateQueries({ queryKey: TRANSCRIPT_READER_PREFIX }),
    'queries.invalidate_failed',
  );
  background(
    client.invalidateQueries({ queryKey: TRANSCRIPT_SESSIONS_PREFIX }),
    'queries.invalidate_failed',
  );
}

export function transcriptCameraChanges(client: QueryClient, changes: readonly LiveChange[]): void {
  if (changes.some((change) => change.table === 'cameras')) {
    background(
      client.invalidateQueries({ queryKey: transcriptKeys.status() }),
      'queries.invalidate_failed',
    );
  }
}
