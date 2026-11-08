import { MESSAGE_QUOTE, type MessageQuote } from '@smarteverything/domain';
import { plainTextOf } from '@smarteverything/domain/markdown';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { jsonText, SQL_JSON, type Sql } from '../sql';
import type { Migration } from './migration';

const QUOTING_ROW = z.object({ id: z.string(), quote: SQL_JSON });

const QUOTED_ROW = z.object({
  text: z.string(),
  attachments: SQL_JSON,
});

const ATTACHMENTS = z.array(z.looseObject({ transcript: z.string().nullish() }));

function collapsed(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function sourceOf(quoted: z.output<typeof QUOTED_ROW>): string {
  if (quoted.text.trim() !== '') return quoted.text;
  const transcripts = ATTACHMENTS.parse(quoted.attachments).map((item) => item.transcript ?? '');
  return transcripts.find((text) => text !== '') ?? '';
}

function plainExcerptOf(sql: Sql, quote: MessageQuote): string {
  const quoted = sql.get(
    QUOTED_ROW,
    'select text, attachments from assistant_messages where id = $id',
    { id: quote.message_id },
  );
  const source = quoted === undefined ? null : sourceOf(quoted);
  const unchanged = source !== null && collapsed(source) === quote.excerpt;
  return plainTextOf(unchanged ? source : quote.excerpt);
}

export function plainQuoteExcerpts(sql: Sql): LogPayload {
  const rows = sql.all(
    QUOTING_ROW,
    'select id, quote from assistant_messages where quote is not null',
  );
  let rewritten = 0;
  for (const row of rows) {
    const quote = MESSAGE_QUOTE.parse(row.quote);
    const excerpt = plainExcerptOf(sql, quote);
    if (excerpt === quote.excerpt) continue;
    rewritten += 1;
    sql.run(
      'store the quote excerpt as plain text',
      'update assistant_messages set quote = $quote where id = $id',
      { id: row.id, quote: jsonText({ ...quote, excerpt }) },
    );
  }
  return { quotes: rows.length, rewritten };
}

export const QUOTE_EXCERPTS_MIGRATION: Migration = {
  version: 194,
  name: 'quote-excerpts',
  statements: [],
  backfill: plainQuoteExcerpts,
};
