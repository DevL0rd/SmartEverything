import { Logger } from '@smarteverything/logging';
import { type InfiniteData, type UseInfiniteQueryResult } from '@tanstack/react-query';
import { useScreenInfiniteQuery } from '../use-screen-query';
import type { TranscriptPage } from '@smarteverything/domain';
import {
  TRANSCRIPT_CHUNK_SIZE,
  TRANSCRIPT_KEPT_CHUNKS,
  transcriptReaderKey,
  type TranscriptSelection,
} from './selection';
import { errorFields } from '../../design/log-tally';
import { readTranscriptPage, readTranscriptRange } from './transcript-requests';

export type Position =
  | { readonly kind: 'latest' }
  | { readonly kind: 'anchor'; readonly id: number }
  | { readonly kind: 'cursor'; readonly cursor: string; readonly direction: 'before' | 'after' };

const log = new Logger('app.transcripts');

export interface Chunk {
  readonly page: TranscriptPage;
  readonly missingAnchor: boolean;
}

async function readChunk(
  selection: TranscriptSelection,
  words: string,
  position: Position,
): Promise<Chunk> {
  const startedAt = Date.now();
  const base = { position: position.kind, searchLength: words.length };
  try {
    const chunk = await readChunkUnlogged(selection, words, position);
    log.debug('transcript_chunk.read', () => ({
      ...base,
      items: chunk.page.items.length,
      hasBefore: chunk.page.before !== null,
      hasAfter: chunk.page.after !== null,
      missingAnchor: chunk.missingAnchor,
      durationMs: Date.now() - startedAt,
    }));
    return chunk;
  } catch (error) {
    log.warn('transcript_chunk.failed', {
      ...base,
      durationMs: Date.now() - startedAt,
      ...errorFields(error),
    });
    throw error;
  }
}

async function readChunkUnlogged(
  selection: TranscriptSelection,
  words: string,
  position: Position,
): Promise<Chunk> {
  if (position.kind === 'anchor') {
    const range = await readTranscriptRange(selection, position.id, TRANSCRIPT_CHUNK_SIZE);
    return { page: range.page, missingAnchor: range.anchor === null };
  }
  const page = await readTranscriptPage(selection, {
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
  selection: TranscriptSelection,
  words: string,
  anchor: number | null,
  enabled: boolean,
): UseInfiniteQueryResult<InfiniteData<Chunk, Position>> {
  const initialPageParam: Position =
    anchor === null ? { kind: 'latest' } : { kind: 'anchor', id: anchor };
  return useScreenInfiniteQuery<
    Chunk,
    Error,
    InfiniteData<Chunk, Position>,
    readonly unknown[],
    Position
  >({
    enabled,
    queryKey: transcriptReaderKey(selection, words, anchor),
    initialPageParam,
    queryFn: ({ pageParam }) => readChunk(selection, anchor === null ? words : '', pageParam),
    getNextPageParam: (last) => boundary(last.page.before, 'before'),
    getPreviousPageParam: (first) => boundary(first.page.after, 'after'),
    maxPages: TRANSCRIPT_KEPT_CHUNKS,
    gcTime: 0,
  });
}
