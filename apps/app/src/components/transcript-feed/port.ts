import type { TranscriptPage, TranscriptRange } from '@smarteverything/domain';

export interface TranscriptPageRequest {
  readonly cursor?: string;
  readonly direction: 'before' | 'after';
  readonly words: string;
  readonly limit: number;
}

export interface TranscriptFeedPort {
  readonly source: 'camera' | 'plugin';
  readonly scope: string;
  readonly selection?: string;
  readonly read: (request: TranscriptPageRequest) => Promise<TranscriptPage>;
  readonly range: (anchor: number, limit: number) => Promise<TranscriptRange>;
}

export const TRANSCRIPT_READER_PREFIX = ['window', 'transcript-readers'] as const;
export const TRANSCRIPT_SOURCE_PREFIX = ['window', 'transcript-reader-sources'] as const;
export const TRANSCRIPT_CHUNK_SIZE = 50;
export const TRANSCRIPT_KEPT_CHUNKS = 3;

export function transcriptReaderKey(
  port: Pick<TranscriptFeedPort, 'source' | 'scope' | 'selection'>,
  words: string,
  anchor: number | null,
): readonly unknown[] {
  return [
    ...TRANSCRIPT_READER_PREFIX,
    port.source,
    port.scope,
    port.selection ?? '',
    words,
    anchor,
  ];
}

export function transcriptSourceKey(
  port: Pick<TranscriptFeedPort, 'source' | 'scope'>,
): readonly string[] {
  return [...TRANSCRIPT_SOURCE_PREFIX, port.source, port.scope];
}
