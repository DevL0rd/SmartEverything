import { z } from 'zod';
import {
  TRANSCRIPT_DETAIL,
  TRANSCRIPT_HIT,
  TRANSCRIPT_LINE,
  TRANSCRIPT_SESSION,
  TRANSCRIPT_SETTINGS,
  TRANSCRIPT_SETTINGS_CHANGE,
  TRANSCRIPT_SOURCES,
  TRANSCRIPT_STATUS,
} from '../transcripts';
import {
  TRANSCRIPT_CURSOR,
  TRANSCRIPT_PAGE,
  TRANSCRIPT_RANGE,
  TRANSCRIPT_PAGE_LIMIT,
} from '../transcript-reader';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, MOMENT, NOTHING, queryLimit } from './primitives';

const CAMERA_SCOPE_QUERY = z.strictObject({ cameraId: ID.optional() });
const SOURCE_ID = z.string().min(1).max(200);
const FEED_SCOPE_QUERY = z.strictObject({
  source: z.enum(TRANSCRIPT_SOURCES).optional().describe('Defaults to camera speech'),
  sourceId: SOURCE_ID.optional().describe('Only this camera or plugin source'),
  sessionId: ID.optional().describe('Only this transcript; leave source and sourceId out'),
});
const FEED_QUERY = FEED_SCOPE_QUERY.extend({
  cursor: TRANSCRIPT_CURSOR.optional(),
  direction: z.enum(['before', 'after']).default('before'),
  limit: queryLimit(50, TRANSCRIPT_PAGE_LIMIT),
});
const SEARCH_FEED_QUERY = FEED_QUERY.extend({ q: z.string().trim().min(1).max(200) });
const RANGE_QUERY = FEED_SCOPE_QUERY.extend({
  anchor: z.coerce.number().int().min(1),
  limit: queryLimit(50, TRANSCRIPT_PAGE_LIMIT),
});

const LEGACY_LINE = TRANSCRIPT_LINE.omit({ ended_at: true, timing: true }).strip();
const LEGACY_DETAIL = TRANSCRIPT_DETAIL.extend({ lines: z.array(LEGACY_LINE) });
const LEGACY_HIT = TRANSCRIPT_HIT.extend({ line: LEGACY_LINE });

const SESSION_PARAMS = z.strictObject({ sessionId: ID });
const REMOVE_QUERY = z.strictObject({
  lineId: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Delete only this line; leave out to delete the whole transcript'),
});

const SESSION_LIST_QUERY = z.strictObject({
  source: z.enum(TRANSCRIPT_SOURCES).optional(),
  sourceId: SOURCE_ID.optional(),
  pluginId: z.string().min(1).max(200).optional(),
  before: MOMENT.optional().describe('Only sessions that started before this moment'),
  limit: queryLimit(50, 200),
});

const SESSION_READ_QUERY = z.strictObject({
  after: z.coerce.number().int().min(0).optional().describe('Only lines after this line id'),
  limit: queryLimit(200, 1000),
});

const SEARCH_QUERY = z.strictObject({
  q: z.string().trim().min(1).max(200).describe('Words to look for in what was said'),
  source: z.enum(TRANSCRIPT_SOURCES).optional(),
  sourceId: SOURCE_ID.optional(),
  limit: queryLimit(30, 100),
});

export const TRANSCRIPT_ENDPOINTS = {
  readCameraTranscriptFeed: endpoint({
    method: 'GET',
    path: '/api/camera-transcripts/feed',
    access: 'member',
    summary:
      'Bounded speech feed of camera or plugin transcripts, optionally one source or one transcript; cursor chunks in chronological order',
    params: NOTHING,
    query: FEED_QUERY,
    body: NO_BODY,
    response: TRANSCRIPT_PAGE,
  }),
  searchCameraTranscriptFeed: endpoint({
    method: 'GET',
    path: '/api/camera-transcripts/search',
    access: 'member',
    summary: 'Search speech with server FTS and bounded timestamped cursor results',
    params: NOTHING,
    query: SEARCH_FEED_QUERY,
    body: NO_BODY,
    response: TRANSCRIPT_PAGE,
  }),
  readCameraTranscriptRange: endpoint({
    method: 'GET',
    path: '/api/camera-transcripts/range',
    access: 'member',
    summary: 'Read bounded speech around an exact line; unavailable anchors return an empty range',
    params: NOTHING,
    query: RANGE_QUERY,
    body: NO_BODY,
    response: TRANSCRIPT_RANGE,
  }),
  listTranscripts: endpoint({
    method: 'GET',
    path: '/api/transcript-sessions',
    access: 'member',
    summary: 'Transcripts of what cameras heard and of plugin conversations, newest first',
    params: NOTHING,
    query: SESSION_LIST_QUERY,
    body: NO_BODY,
    response: z.array(TRANSCRIPT_SESSION),
  }),
  readTranscript: endpoint({
    method: 'GET',
    path: '/api/transcript-sessions/:sessionId',
    access: 'member',
    summary: 'One transcript with its lines in order, from a line id on',
    params: SESSION_PARAMS,
    query: SESSION_READ_QUERY,
    body: NO_BODY,
    response: LEGACY_DETAIL,
  }),
  removeTranscript: endpoint({
    method: 'DELETE',
    path: '/api/transcript-sessions/:sessionId',
    access: 'member',
    summary:
      'Delete one line of a transcript, or the whole transcript with all its lines when no line is given; a conversation still in progress stays',
    params: SESSION_PARAMS,
    query: REMOVE_QUERY,
    body: NO_BODY,
    response: DONE,
  }),
  searchTranscripts: endpoint({
    method: 'GET',
    path: '/api/transcript-search',
    access: 'member',
    summary: 'Find lines in transcripts by words, newest first',
    params: NOTHING,
    query: SEARCH_QUERY,
    body: NO_BODY,
    response: z.array(LEGACY_HIT),
  }),
  readTranscriptSettings: endpoint({
    method: 'GET',
    path: '/api/transcript-settings',
    access: 'member',
    summary: 'How long transcripts are kept and the daily spending cap for listening',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: TRANSCRIPT_SETTINGS,
  }),
  updateTranscriptSettings: endpoint({
    method: 'PATCH',
    path: '/api/transcript-settings',
    access: 'member',
    summary: 'Change how long transcripts are kept or the daily spending cap for listening',
    params: NOTHING,
    query: NOTHING,
    body: TRANSCRIPT_SETTINGS_CHANGE,
    response: TRANSCRIPT_SETTINGS,
  }),
  readTranscriptStatus: endpoint({
    method: 'GET',
    path: '/api/transcript-status',
    access: 'member',
    summary:
      'For each camera whether it transcribes what it hears, listening or paused and why, with today’s spend against the cap',
    params: NOTHING,
    query: CAMERA_SCOPE_QUERY,
    body: NO_BODY,
    response: TRANSCRIPT_STATUS,
  }),
} as const;
