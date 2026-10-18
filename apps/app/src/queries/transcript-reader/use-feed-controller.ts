import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue } from '../../design/use-debounced-value';
import type { TranscriptFeedState } from '../../components/transcript-feed/state';
import { transcriptReaderKey, type TranscriptSelection } from './selection';
import { useTranscriptReader } from './use-transcript-reader';
import { background } from '@smarteverything/logging';

const SEARCH_DELAY_MS = 300;
const SEARCH_MAX_LENGTH = 200;

function rowsOf(data: ReturnType<typeof useTranscriptReader>['data']): TranscriptFeedState['rows'] {
  if (data === undefined) return [];
  return data.pages.flatMap((chunk) => [...chunk.page.items].reverse());
}

export function useFeedController(
  selection: TranscriptSelection,
  enabled = true,
): TranscriptFeedState {
  const client = useQueryClient();
  const [words, setWords] = useState('');
  const [anchor, setAnchor] = useState<number | null>(null);
  const delayed = useDebouncedValue(words.trim(), SEARCH_DELAY_MS);
  const settled = words.trim() === '' ? '' : delayed;
  const reader = useTranscriptReader(selection, settled, anchor, enabled);
  const missingAnchor = reader.data?.pages.some((chunk) => chunk.missingAnchor) === true;
  return {
    rows: rowsOf(reader.data),
    words,
    settled,
    anchor: missingAnchor ? null : anchor,
    context: anchor !== null,
    missingAnchor,
    error: reader.error,
    loading: reader.isPending,
    older: reader.hasNextPage,
    newer: reader.hasPreviousPage,
    loadingOlder: reader.isFetchingNextPage,
    loadOlder: (): void => {
      if (reader.hasNextPage && !reader.isFetching)
        background(reader.fetchNextPage(), 'next_page.fetch_failed');
    },
    loadNewer: (): void => {
      if (reader.hasPreviousPage && !reader.isFetching)
        background(reader.fetchPreviousPage(), 'previous_page.fetch_failed');
    },
    refresh: (): void => {
      background(reader.refetch(), 'reader.refetch_failed');
    },
    latest: (): void => {
      setWords('');
      setAnchor(null);
      const queryKey = transcriptReaderKey(selection, '', null);
      background(client.resetQueries({ queryKey, exact: true }), 'transcript.reset_failed');
    },
    back: setAnchor.bind(null, null),
    changeWords: (value: string): void => {
      setWords(value.slice(0, SEARCH_MAX_LENGTH));
    },
    open: (id: number): void => {
      setAnchor(id);
    },
  };
}
