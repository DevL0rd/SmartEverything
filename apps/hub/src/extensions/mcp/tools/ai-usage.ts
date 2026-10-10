import {
  USAGE_BUCKET,
  USAGE_CURSOR,
  USAGE_LEDGER_LIMIT,
  USAGE_SOURCE,
  USAGE_SPLIT,
  USAGE_WORK,
  usdOfMicros,
  type UsageFilter,
  type UsageLedgerRow,
  type UsagePart,
  type UsagePoint,
  type UsageQuery,
  type UsageSum,
} from '@smarteverything/domain';
import { z } from 'zod';
import { usageFilterFor, type UsageViewer } from '../../../ledger/usage-scope';
import { READS, defineTool, type Tool, type ToolContext } from './registry';

const DAY_MS = 86_400_000;

const KEY = z.string().trim().min(1).max(200);

const WINDOW = {
  from: z.iso
    .datetime({ offset: true })
    .optional()
    .describe('Start of the window (ISO time); defaults to `days` before `to`'),
  to: z.iso.datetime({ offset: true }).optional().describe('End of the window; defaults to now'),
  days: z.int().min(1).max(400).default(30).describe('Window length when `from` is not given'),
  profileIds: z.array(z.uuid()).min(1).optional().describe('Only these people (list_people)'),
  clientIds: z.array(z.uuid()).min(1).optional().describe('Only these paired devices'),
  works: z.array(USAGE_WORK).min(1).optional().describe('Only these kinds of work'),
  sources: z.array(USAGE_SOURCE).min(1).optional().describe('Only these providers'),
  modelIds: z.array(KEY).min(1).optional().describe('Only these model ids'),
  chatId: z.uuid().optional().describe('Only this chat'),
  messageId: z.uuid().optional().describe('Only this message'),
  pluginId: KEY.optional().describe('Only work started by this plugin'),
};

const TOTALS_INPUT = z.strictObject(WINDOW);

const LEDGER_INPUT = z.strictObject({
  ...WINDOW,
  cursor: USAGE_CURSOR.optional().describe('next_cursor from the previous page'),
  limit: z.int().min(1).max(USAGE_LEDGER_LIMIT).default(30).describe('Rows per page'),
});

const SERIES_INPUT = z.strictObject({
  ...WINDOW,
  bucket: USAGE_BUCKET.default('day').describe('Bucket size, in the home time zone'),
  split: USAGE_SPLIT.optional().describe('Break each bucket down by this dimension'),
});

type WindowInput = z.output<typeof TOTALS_INPUT>;

function queryOf(context: ToolContext, input: WindowInput): UsageQuery {
  const to = input.to === undefined ? context.clock.now() : new Date(input.to);
  const from =
    input.from === undefined ? new Date(to.getTime() - input.days * DAY_MS) : new Date(input.from);
  const { profileIds, clientIds, works, sources, modelIds, chatId, messageId, pluginId } = input;
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    profileIds,
    clientIds,
    works,
    sources,
    modelIds,
    chatId,
    messageId,
    pluginId,
  };
}

function viewerOf(context: ToolContext): UsageViewer {
  const { actor } = context;
  if (actor === null) {
    return { role: 'owner' };
  }
  const client = actor.clientId === null ? null : context.store.clients.byId(actor.clientId);
  return client?.role === 'owner'
    ? { role: 'owner' }
    : { role: 'member', profileId: actor.profileId };
}

function filterOf(context: ToolContext, input: WindowInput): UsageFilter {
  return usageFilterFor(queryOf(context, input), viewerOf(context));
}

function ledgerEntryOf(row: UsageLedgerRow): Record<string, unknown> {
  const { cost_micros: micros, ...rest } = row;
  return { ...rest, usd: usdOfMicros(micros) };
}

function usdOf(part: UsagePart): Record<string, unknown> {
  return {
    key: part.key,
    label: part.label,
    count: part.count,
    usd: usdOfMicros(part.cost_micros),
  };
}

function sumOf(sum: UsageSum): Record<string, unknown> {
  return {
    ...sum,
    usd: usdOfMicros(sum.cost_micros),
    pending_usd: usdOfMicros(sum.pending_micros),
  };
}

function pointOf(point: UsagePoint): Record<string, unknown> {
  return {
    start: point.start,
    end: point.end,
    count: point.count,
    usd: usdOfMicros(point.cost_micros),
    parts: point.parts.map(usdOf),
  };
}

export const AI_USAGE_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'usage_totals',
    input: TOTALS_INPUT,
    annotations: READS,
    run: (context, input) => {
      const totals = context.store.ledger.totals(filterOf(context, input));
      return {
        structured: {
          from: totals.from,
          to: totals.to,
          total: sumOf(totals.sum),
          by: Object.fromEntries(
            Object.entries(totals.by).map(([split, parts]) => [split, parts.map(usdOf)]),
          ),
        },
      };
    },
  }),
  defineTool({
    name: 'usage_series',
    input: SERIES_INPUT,
    annotations: READS,
    run: (context, input) => {
      const series = context.store.ledger.report(
        filterOf(context, input),
        input.bucket,
        input.split ?? null,
      );
      return { structured: { ...series, points: series.points.map(pointOf) } };
    },
  }),
  defineTool({
    name: 'usage_ledger',
    input: LEDGER_INPUT,
    annotations: READS,
    run: (context, input) => {
      const page = context.store.ledger.ledger({
        filter: filterOf(context, input),
        cursor: input.cursor,
        limit: input.limit,
      });
      return { structured: { rows: page.rows.map(ledgerEntryOf), next_cursor: page.next_cursor } };
    },
  }),
];
