import { z } from 'zod';
import {
  TRANSCRIPT_DETAIL,
  TRANSCRIPT_HIT,
  TRANSCRIPT_SESSION,
  TRANSCRIPT_SETTINGS,
  TRANSCRIPT_SETTINGS_CHANGE,
  TRANSCRIPT_SOURCES,
  TRANSCRIPT_STATUS,
} from '../transcripts';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, MOMENT, NOTHING, queryLimit } from './primitives';

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
    response: TRANSCRIPT_DETAIL,
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
    response: z.array(TRANSCRIPT_HIT),
  }),
  readTranscriptSettings: endpoint({
    method: 'GET',
    path: '/api/transcript-settings',
    access: 'member',
    summary: 'How long camera transcripts are kept and the daily spending cap for camera listening',
    params: NOTHING,
    query: NOTHING,
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
    query: NOTHING,
    body: NO_BODY,
    response: TRANSCRIPT_STATUS,
  }),
} as const;
