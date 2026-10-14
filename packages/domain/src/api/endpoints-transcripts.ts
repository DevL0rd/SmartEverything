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
const FEED_QUERY = CAMERA_SCOPE_QUERY.extend({
  cursor: TRANSCRIPT_CURSOR.optional(),
  direction: z.enum(['before', 'after']).default('before'),
  limit: queryLimit(50, TRANSCRIPT_PAGE_LIMIT),
});
const CAMERA_SEARCH_QUERY = FEED_QUERY.extend({ q: z.string().trim().min(1).max(200) });
const RANGE_QUERY = CAMERA_SCOPE_QUERY.extend({
  anchor: z.coerce.number().int().min(1),
  limit: queryLimit(50, TRANSCRIPT_PAGE_LIMIT),
});

const LEGACY_LINE = TRANSCRIPT_LINE.omit({ ended_at: true, timing: true }).strip();
const LEGACY_DETAIL = TRANSCRIPT_DETAIL.extend({ lines: z.array(LEGACY_LINE) });
const LEGACY_HIT = TRANSCRIPT_HIT.extend({ line: LEGACY_LINE });

const SESSION_PARAMS = z.strictObject({ sessionId: ID });

const SESSION_LIST_QUERY = z.strictObject({
  source: z.enum(TRANSCRIPT_SOURCES).optional(),
  sourceId: z.string().min(1).max(200).optional(),
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
  sourceId: z.string().min(1).max(200).optional(),
  limit: queryLimit(30, 100),
});

export const TRANSCRIPT_ENDPOINTS = {
  readCameraTranscriptFeed: endpoint({
    method: 'GET',
    path: '/api/camera-transcripts/feed',
    access: 'member',
    summary:
      'Bounded camera speech feed for view-authorized cameras; cursor chunks in chronological order',
    params: NOTHING,
    query: FEED_QUERY,
    body: NO_BODY,
    response: TRANSCRIPT_PAGE,
  }),
  searchCameraTranscriptFeed: endpoint({
    method: 'GET',
    path: '/api/camera-transcripts/search',
    access: 'member',
    summary: 'Search camera speech with server FTS and bounded timestamped cursor results',
    params: NOTHING,
    query: CAMERA_SEARCH_QUERY,
    body: NO_BODY,
    response: TRANSCRIPT_PAGE,
  }),
  readCameraTranscriptRange: endpoint({
    method: 'GET',
    path: '/api/camera-transcripts/range',
    access: 'member',
    summary:
      'Read bounded camera speech around an exact line; unavailable anchors return an empty range',
    params: NOTHING,
    query: RANGE_QUERY,
    body: NO_BODY,
    response: TRANSCRIPT_RANGE,
  }),
  listTranscripts: endpoint({
    method: 'GET',
    path: '/api/transcript-sessions',
    access: 'member',
    summary:
      'Transcripts of what cameras heard and of plugin conversations, newest first; only the owner reads them',
    params: NOTHING,
    query: SESSION_LIST_QUERY,
    body: NO_BODY,
    response: z.array(TRANSCRIPT_SESSION),
  }),
  readTranscript: endpoint({
    method: 'GET',
    path: '/api/transcript-sessions/:sessionId',
    access: 'member',
    summary: 'One transcript with its lines in order, from a line id on; only the owner reads it',
    params: SESSION_PARAMS,
    query: SESSION_READ_QUERY,
    body: NO_BODY,
    response: LEGACY_DETAIL,
  }),
  removeTranscript: endpoint({
    method: 'DELETE',
    path: '/api/transcript-sessions/:sessionId',
    access: 'member',
    summary: 'Delete one transcript with all its lines; a conversation still in progress stays',
    params: SESSION_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  searchTranscripts: endpoint({
    method: 'GET',
    path: '/api/transcript-search',
    access: 'member',
    summary: 'Find lines in transcripts by words, newest first; only the owner searches them',
    params: NOTHING,
    query: SEARCH_QUERY,
    body: NO_BODY,
    response: z.array(LEGACY_HIT),
  }),
  readTranscriptSettings: endpoint({
    method: 'GET',
    path: '/api/transcript-settings',
    access: 'member',
    summary: 'How long camera transcripts are kept and the daily spending cap for camera listening',
    params: NOTHING,
    query: CAMERA_SCOPE_QUERY,
    body: NO_BODY,
    response: TRANSCRIPT_SETTINGS,
  }),
  updateTranscriptSettings: endpoint({
    method: 'PATCH',
    path: '/api/transcript-settings',
    access: 'member',
    summary: 'Change how long camera transcripts are kept or the daily spending cap for listening',
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
