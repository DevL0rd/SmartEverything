import {
  ApiError,
  type AiUsageRow,
  type UsageLedgerPage,
  type UsageLedgerRow,
  type UsageNamed,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Sql } from '../store/sql';
import { labelsOf } from './labels';
import { messageOf } from '@smarteverything/logging';

const POSITION = z.strictObject({ at: z.iso.datetime({ offset: true }), id: z.uuid() });

export type LedgerPosition = z.output<typeof POSITION>;

function cursorOf(row: AiUsageRow): string {
  return Buffer.from(JSON.stringify({ at: row.at, id: row.id })).toString('base64url');
}

const CURSOR_JSON = z
  .string()
  .transform((text, context): unknown => {
    try {
      return JSON.parse(text);
    } catch (cause) {
      context.addIssue({
        code: 'custom',
        message: `the cursor is not JSON: ${messageOf(cause)}`,
      });
      return z.NEVER;
    }
  })
  .pipe(POSITION);

export function positionOf(cursor: string): LedgerPosition {
  const parsed = CURSOR_JSON.safeParse(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'That page link is no longer valid; start from the top.');
  }
  return parsed.data;
}

const COLUMNS = {
  profile: (row: AiUsageRow): string => row.profile_id,
  client: (row: AiUsageRow): string | null => row.client_id,
  chat: (row: AiUsageRow): string | null => row.chat_id,
  model: (row: AiUsageRow): string | null => row.model_id,
  plugin: (row: AiUsageRow): string | null => row.plugin_id,
} as const;

type Named = keyof typeof COLUMNS;

type Names = Readonly<Record<Named, (key: string) => string>>;

function namesOf(sql: Sql, rows: readonly AiUsageRow[]): Names {
  const keysOf = (split: Named): string[] =>
    rows.flatMap((row) => {
      const key = COLUMNS[split](row);
      return key === null ? [] : [key];
    });
  return {
    profile: labelsOf(sql, 'profile', keysOf('profile')),
    client: labelsOf(sql, 'client', keysOf('client')),
    chat: labelsOf(sql, 'chat', keysOf('chat')),
    model: labelsOf(sql, 'model', keysOf('model')),
    plugin: labelsOf(sql, 'plugin', keysOf('plugin')),
  };
}

function named(key: string | null, label: (key: string) => string): UsageNamed | null {
  return key === null ? null : { id: key, label: label(key) };
}

function ledgerRowOf(row: AiUsageRow, names: Names): UsageLedgerRow {
  return {
    id: row.id,
    at: row.at,
    work: row.work,
    source: row.source,
    cost_micros: row.cost_micros,
    cost_state: row.cost_state,
    cost_available: row.cost_state === 'reconciled' || row.meta['cost_available'] !== false,
    usage_available: row.meta['usage_available'] !== false,
    tokens_in: row.tokens_in,
    tokens_out: row.tokens_out,
    tokens_reasoning: row.tokens_reasoning,
    audio_in_ms: row.audio_in_ms,
    audio_out_ms: row.audio_out_ms,
    images: row.images,
    video_ms: row.video_ms,
    profile: { id: row.profile_id, label: names.profile(row.profile_id) },
    client: named(row.client_id, names.client),
    chat: named(row.chat_id, names.chat),
    model: named(row.model_id, names.model),
    plugin: named(row.plugin_id, names.plugin),
  };
}

export function ledgerPageOf(
  sql: Sql,
  rows: readonly AiUsageRow[],
  limit: number,
): UsageLedgerPage {
  const shown = rows.slice(0, limit);
  const names = namesOf(sql, shown);
  const last = shown.at(-1);
  return {
    rows: shown.map((row) => ledgerRowOf(row, names)),
    next_cursor: rows.length > limit && last !== undefined ? cursorOf(last) : null,
  };
}
