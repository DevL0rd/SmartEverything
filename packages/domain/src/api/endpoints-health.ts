import { z } from 'zod';
import { HEALTH_BATCH, HEALTH_INGEST_RESULT, HEALTH_RECORD, HEALTH_RECORD_TYPE } from '../health';
import { NO_BODY, endpoint } from './endpoint';
import { DAY, DONE, ID, MOMENT, NOTHING, QUERY_FLAG, queryList } from './primitives';
import {
  HEALTH_DAILY_ROW,
  HEALTH_METRIC,
  HEALTH_SOURCE_NAME,
  HEALTH_SOURCE_ROW,
  MCP_TOKEN_ROW,
  OAUTH_CLIENT_ROW,
  TOKEN_NAME,
} from './rows-access';
import { ISSUED_TOKEN } from './endpoints-access';

export const BEST_DAY = z.strictObject({ day: DAY, value: z.number() }).nullable();

export const MCP_APPROVAL_CODE = z.strictObject({
  code: z.string().regex(/^[0-9]{6}$/),
  expiresAt: MOMENT,
});

export type McpApprovalCode = z.infer<typeof MCP_APPROVAL_CODE>;

export const HEALTH_SIGHTING = z.strictObject({
  sourceApp: z.string().min(1),
  recordType: HEALTH_RECORD_TYPE,
});

const HEALTH_ENDPOINTS = {
  listHealthSources: endpoint({
    method: 'GET',
    path: '/api/health/sources',
    access: 'member',
    summary: 'Every phone allowed to upload health data',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(HEALTH_SOURCE_ROW),
  }),
  createHealthSource: endpoint({
    method: 'POST',
    path: '/api/health/sources',
    access: 'member',
    summary: 'Allow the calling phone to upload health data; the upload token is returned once',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ name: HEALTH_SOURCE_NAME }),
    response: ISSUED_TOKEN.extend({ source: HEALTH_SOURCE_ROW }),
  }),
  revokeHealthSource: endpoint({
    method: 'DELETE',
    path: '/api/health/sources/:sourceId',
    access: 'member',
    summary: 'Stop accepting uploads with a health source token',
    params: z.strictObject({ sourceId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: HEALTH_SOURCE_ROW,
  }),
  ingestHealth: endpoint({
    method: 'POST',
    path: '/api/health/ingest',
    access: 'health_source',
    summary: 'Upload a batch of Health Connect records and deletions',
    params: NOTHING,
    query: NOTHING,
    body: HEALTH_BATCH,
    response: HEALTH_INGEST_RESULT,
  }),
  readHealthDaily: endpoint({
    method: 'GET',
    path: '/api/health/daily',
    access: 'member',
    summary: 'Daily figures of the named metrics between two days',
    params: NOTHING,
    query: z.strictObject({ from: DAY, to: DAY, metrics: queryList(HEALTH_METRIC) }),
    body: NO_BODY,
    response: z.array(HEALTH_DAILY_ROW),
  }),
  readBestDay: endpoint({
    method: 'GET',
    path: '/api/health/daily/best',
    access: 'member',
    summary: 'The day with the highest, or lowest, figure of a metric',
    params: NOTHING,
    query: z.strictObject({ metric: HEALTH_METRIC, lowest: QUERY_FLAG.default(false) }),
    body: NO_BODY,
    response: BEST_DAY,
  }),
  readHealthRecords: endpoint({
    method: 'GET',
    path: '/api/health/records',
    access: 'member',
    summary: 'Records of the named types that overlap a time range',
    params: NOTHING,
    query: z.strictObject({
      types: queryList(HEALTH_RECORD_TYPE),
      from: MOMENT,
      to: MOMENT,
    }),
    body: NO_BODY,
    response: z.array(HEALTH_RECORD),
  }),
  readHealthRecord: endpoint({
    method: 'GET',
    path: '/api/health/records/:recordId',
    access: 'member',
    summary: 'One record by its Health Connect id',
    params: z.strictObject({ recordId: z.string().min(1).max(200) }),
    query: NOTHING,
    body: NO_BODY,
    response: HEALTH_RECORD,
  }),
  readHealthSightings: endpoint({
    method: 'GET',
    path: '/api/health/sightings',
    access: 'member',
    summary: 'Which apps wrote which record types since a moment',
    params: NOTHING,
    query: z.strictObject({ since: MOMENT }),
    body: NO_BODY,
    response: z.array(HEALTH_SIGHTING),
  }),
} as const;

const ASSISTANT_ENDPOINTS = {
  listMcpTokens: endpoint({
    method: 'GET',
    path: '/api/mcp/tokens',
    access: 'owner',
    summary: 'Every personal MCP token, without the token itself',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(MCP_TOKEN_ROW),
  }),
  createMcpToken: endpoint({
    method: 'POST',
    path: '/api/mcp/tokens',
    access: 'owner',
    summary: 'Create a personal MCP token; it is returned once',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ name: TOKEN_NAME }),
    response: ISSUED_TOKEN.extend({ row: MCP_TOKEN_ROW }),
  }),
  revokeMcpToken: endpoint({
    method: 'DELETE',
    path: '/api/mcp/tokens/:tokenId',
    access: 'owner',
    summary: 'Revoke a personal MCP token',
    params: z.strictObject({ tokenId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: MCP_TOKEN_ROW,
  }),
  listOAuthGrants: endpoint({
    method: 'GET',
    path: '/api/oauth/grants',
    access: 'owner',
    summary: 'Every assistant allowed through OAuth and not revoked',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(OAUTH_CLIENT_ROW),
  }),
  revokeOAuthGrant: endpoint({
    method: 'DELETE',
    path: '/api/oauth/grants/:clientId',
    access: 'owner',
    summary: 'Revoke an assistant’s access',
    params: z.strictObject({ clientId: z.string().min(1).max(200) }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  createApprovalCode: endpoint({
    method: 'POST',
    path: '/oauth/approval-code',
    access: 'owner',
    summary: 'A fresh six-digit approval code and its expiry, replacing the last one',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: MCP_APPROVAL_CODE,
  }),
} as const;

export const HEALTH_AREA_ENDPOINTS = { ...HEALTH_ENDPOINTS, ...ASSISTANT_ENDPOINTS } as const;
