import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import type { TranscriptPage } from '@smarteverything/domain';
import {
  TRANSCRIPT_CHUNK_SIZE,
  TRANSCRIPT_KEPT_CHUNKS,
  transcriptReaderKey,
  type TranscriptFeedPort,
} from '../../components/transcript-feed/port';

export type Position =
  | { readonly kind: 'latest' }
  | { readonly kind: 'anchor'; readonly id: number }
  | { readonly kind: 'cursor'; readonly cursor: string; readonly direction: 'before' | 'after' };

export interface Chunk {
  readonly page: TranscriptPage;
  readonly missingAnchor: boolean;
}

async function readChunk(
  port: TranscriptFeedPort,
  words: string,
  position: Position,
): Promise<Chunk> {
  if (position.kind === 'anchor') {
    const range = await port.range(position.id, TRANSCRIPT_CHUNK_SIZE);
    return { page: range.page, missingAnchor: range.anchor === null };
  }
  const page = await port.read({
    words,
    limit: TRANSCRIPT_CHUNK_SIZE,
    direction: position.kind === 'cursor' ? position.direction : 'before',
    ...(position.kind === 'cursor' ? { cursor: position.cursor } : {}),
  });
  return { page, missingAnchor: false };
}

function boundary(cursor: string | null, direction: 'before' | 'after'): Position | undefined {
  return cursor === null ? undefined : { kind: 'cursor', cursor, direction };
}

export function useTranscriptReader(
  port: TranscriptFeedPort,
  words: string,
  anchor: number | null,
  enabled: boolean,
): UseInfiniteQueryResult<InfiniteData<Chunk, Position>> {
  const initialPageParam: Position =
    anchor === null ? { kind: 'latest' } : { kind: 'anchor', id: anchor };
  return useInfiniteQuery<
    Chunk,
    Error,
    InfiniteData<Chunk, Position>,
    readonly unknown[],
    Position
  >({
    enabled,
    queryKey: transcriptReaderKey(port, words, anchor),
    initialPageParam,
    queryFn: ({ pageParam }) => readChunk(port, anchor === null ? words : '', pageParam),
    getNextPageParam: (last) => boundary(last.page.before, 'before'),
    getPreviousPageParam: (first) => boundary(first.page.after, 'after'),
    maxPages: TRANSCRIPT_KEPT_CHUNKS,
    gcTime: 0,
    retry: false,
  });
}
