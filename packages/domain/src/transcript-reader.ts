import { z } from 'zod';
import { TRANSCRIPT_HIT, TRANSCRIPT_LINE } from './transcripts';

export const TRANSCRIPT_NOTICE_CAPABILITY = 'transcript-notices-v1';

export const TRANSCRIPT_PAGE_LIMIT = 100;
export const TRANSCRIPT_CURSOR = z.string().min(1).max(2048);
export const TRANSCRIPT_PAGE = z.strictObject({
  items: z.array(TRANSCRIPT_HIT).max(TRANSCRIPT_PAGE_LIMIT),
  before: TRANSCRIPT_CURSOR.nullable(),
  after: TRANSCRIPT_CURSOR.nullable(),
});
export type TranscriptPage = z.output<typeof TRANSCRIPT_PAGE>;
export const TRANSCRIPT_RANGE = z.strictObject({
  anchor: TRANSCRIPT_LINE.nullable(),
  page: TRANSCRIPT_PAGE,
});
export type TranscriptRange = z.output<typeof TRANSCRIPT_RANGE>;
export const TRANSCRIPT_CHANGED_NOTICE = z.strictObject({
  type: z.literal('transcript_changed'),
  source: z.enum(['camera', 'plugin']),
  source_id: z.string().min(1).max(200),
  plugin_id: z.string().min(1).max(200).nullable(),
  session_id: z.uuid(),
  operation: z.enum(['insert', 'update', 'delete']),
});
export type TranscriptChangedNotice = z.output<typeof TRANSCRIPT_CHANGED_NOTICE>;
