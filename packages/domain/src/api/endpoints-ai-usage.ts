import { z } from 'zod';
import {
  USAGE_BUCKET,
  USAGE_CHOICES,
  USAGE_CURSOR,
  USAGE_LEDGER_LIMIT,
  USAGE_LEDGER_PAGE,
  USAGE_SERIES,
  USAGE_SOURCE,
  USAGE_SPLIT,
  USAGE_TOTALS,
  USAGE_WORK,
} from '../ai-usage';
import { NO_BODY, endpoint } from './endpoint';
import { ID, MOMENT, NOTHING, queryLimit, queryList } from './primitives';

const KEY = z.string().trim().min(1).max(200);

export const USAGE_QUERY = z.strictObject({
  from: MOMENT,
  to: MOMENT,
  profileIds: queryList(ID).optional(),
  clientIds: queryList(ID).optional(),
  works: queryList(USAGE_WORK).optional(),
  sources: queryList(USAGE_SOURCE).optional(),
  modelIds: queryList(KEY).optional(),
  chatId: ID.optional(),
  messageId: ID.optional(),
  pluginId: KEY.optional(),
});

export type UsageQuery = z.output<typeof USAGE_QUERY>;

export const USAGE_SERIES_QUERY = USAGE_QUERY.extend({
  bucket: USAGE_BUCKET.default('day'),
  split: USAGE_SPLIT.optional(),
});

export type UsageSeriesQuery = z.output<typeof USAGE_SERIES_QUERY>;

export const USAGE_LEDGER_QUERY = USAGE_QUERY.extend({
  cursor: USAGE_CURSOR.optional(),
  limit: queryLimit(30, USAGE_LEDGER_LIMIT),
});

export type UsageLedgerQuery = z.output<typeof USAGE_LEDGER_QUERY>;

export const USAGE_CHOICES_QUERY = z.strictObject({ from: MOMENT, to: MOMENT });

export type UsageChoicesQuery = z.output<typeof USAGE_CHOICES_QUERY>;

export const USAGE_SUMMARY = z.strictObject({
  totals: USAGE_TOTALS,
  series: USAGE_SERIES,
});

export type UsageSummary = z.output<typeof USAGE_SUMMARY>;

export const AI_USAGE_ENDPOINTS = {
  readUsageTotals: endpoint({
    method: 'GET',
    path: '/api/ai/usage/totals',
    access: 'member',
    summary:
      'AI spend and usage for a time window with breakdowns; the owner sees everyone, others see only themselves',
    params: NOTHING,
    query: USAGE_QUERY,
    body: NO_BODY,
    response: USAGE_TOTALS,
  }),
  readUsageSeries: endpoint({
    method: 'GET',
    path: '/api/ai/usage/series',
    access: 'member',
    summary: 'AI spend over time in hour, day, week or month buckets in the home time zone',
    params: NOTHING,
    query: USAGE_SERIES_QUERY,
    body: NO_BODY,
    response: USAGE_SERIES,
  }),
  readUsageSummary: endpoint({
    method: 'GET',
    path: '/api/ai/usage/summary',
    access: 'member',
    summary: 'AI usage totals and the series for one filter in a single call',
    params: NOTHING,
    query: USAGE_SERIES_QUERY,
    body: NO_BODY,
    response: USAGE_SUMMARY,
  }),
  listUsageLedger: endpoint({
    method: 'GET',
    path: '/api/ai/usage/ledger',
    access: 'member',
    summary:
      'Every AI cost, newest first, with names for the person, device, chat, model and plugin; filter like the totals and page with the cursor',
    params: NOTHING,
    query: USAGE_LEDGER_QUERY,
    body: NO_BODY,
    response: USAGE_LEDGER_PAGE,
  }),
  readUsageChoices: endpoint({
    method: 'GET',
    path: '/api/ai/usage/choices',
    access: 'member',
    summary:
      'People, devices, work types, providers, models, chats and plugins that used AI in a time window, with names, for filters',
    params: NOTHING,
    query: USAGE_CHOICES_QUERY,
    body: NO_BODY,
    response: USAGE_CHOICES,
  }),
} as const;
