import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue } from '../../design/use-debounced-value';
import {
  transcriptReaderKey,
  type TranscriptFeedPort,
} from '../../components/transcript-feed/port';
import type { TranscriptFeedState } from '../../components/transcript-feed/state';
import { useTranscriptReader } from './use-transcript-reader';
import { useTranscriptAccess } from './reader-access';

const SEARCH_DELAY_MS = 300;
const SEARCH_MAX_LENGTH = 200;

export function useFeedController(port: TranscriptFeedPort, enabled = true): TranscriptFeedState {
  const client = useQueryClient();
  const [words, setWords] = useState('');
  const [anchor, setAnchor] = useState<number | null>(null);
  const delayed = useDebouncedValue(words.trim(), SEARCH_DELAY_MS);
  const settled = words.trim() === '' ? '' : delayed;
  const reader = useTranscriptReader(port, settled, anchor, enabled);
  const retired = useTranscriptAccess(port, reader.error);
  const missingAnchor = reader.data?.pages.some((chunk) => chunk.missingAnchor) === true;
  return {
    rows:
      reader.data === undefined || retired
        ? []
        : reader.data.pages.flatMap((chunk) => [...chunk.page.items].reverse()),
    words,
    settled,
    anchor: missingAnchor || retired ? null : anchor,
    context: anchor !== null,
    missingAnchor,
    error: reader.error,
    loading: reader.isPending,
    fetching: reader.isFetching,
    older: !retired && reader.hasNextPage,
    newer: !retired && reader.hasPreviousPage,
    loadingOlder: reader.isFetchingNextPage,
    loadingNewer: reader.isFetchingPreviousPage,
    loadOlder: (): void => {
      if (!retired && !reader.isFetching) void reader.fetchNextPage();
    },
    loadNewer: (): void => {
      if (!retired && !reader.isFetching) void reader.fetchPreviousPage();
    },
    refresh: (): void => {
      void reader.refetch();
    },
    latest: (): void => {
      setWords('');
      setAnchor(null);
      void client.resetQueries({ queryKey: transcriptReaderKey(port, '', null), exact: true });
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
