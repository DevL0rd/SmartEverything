import type { TranscriptSource } from '@smarteverything/domain';

export interface TranscriptSelection {
  readonly source?: TranscriptSource;
  readonly sourceId?: string;
  readonly sessionId?: string;
}

export const TRANSCRIPT_READER_PREFIX = ['window', 'transcript-readers'] as const;
export const TRANSCRIPT_SESSIONS_PREFIX = ['window', 'transcript-sessions'] as const;
export const TRANSCRIPT_CHUNK_SIZE = 50;
export const TRANSCRIPT_KEPT_CHUNKS = 3;

export function transcriptReaderKey(
  selection: TranscriptSelection,
  words: string,
  anchor: number | null,
): readonly unknown[] {
  return [
    ...TRANSCRIPT_READER_PREFIX,
    selection.source ?? '',
    selection.sourceId ?? '',
    selection.sessionId ?? '',
    words,
    anchor,
  ];
}
