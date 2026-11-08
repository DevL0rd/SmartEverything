import { messageQuoteOf } from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { jsonText, SQL_JSON, type Sql } from '../sql';
import type { Migration } from './migration';

const DIALOGUE_KIND = 'helper_dialogue';

const DIALOGUE_ROW = z.object({ id: z.string(), embeds: SQL_JSON });

const QUOTED_ROW = z.object({
  id: z.string(),
  author: z.string(),
  text: z.string(),
  attachments: SQL_JSON,
});

const EMBEDS = z.array(z.looseObject({ kind: z.string() }));

const QUOTE_ID = z.looseObject({ quoted_message_id: z.string().nullable().optional() });

const ATTACHMENTS = z.array(z.looseObject({ mime: z.string(), transcript: z.string().nullish() }));

function quotedIdOf(embeds: z.output<typeof EMBEDS>): string | null {
  const dialogue = embeds.find(({ kind }) => kind === DIALOGUE_KIND);
  if (dialogue === undefined) return null;
  return QUOTE_ID.parse(dialogue).quoted_message_id ?? null;
}

function withoutQuoteId(embeds: z.output<typeof EMBEDS>): z.output<typeof EMBEDS> {
  return embeds.map((embed) => {
    if (embed.kind !== DIALOGUE_KIND) return embed;
    const { quoted_message_id: _removed, ...rest } = embed;
    return { ...rest, kind: embed.kind };
  });
}

function quoteOf(sql: Sql, id: string): string | null {
  const quoted = sql.get(
    QUOTED_ROW,
    'select id, author, text, attachments from assistant_messages where id = $id',
    { id },
  );
  if (quoted === undefined) return null;
  return jsonText(
    messageQuoteOf({
      id: quoted.id,
      author: quoted.author,
      text: quoted.text,
      attachments: ATTACHMENTS.parse(quoted.attachments).map((item) => ({
        mime: item.mime,
        transcript: item.transcript ?? null,
      })),
    }),
  );
}

export function foldQuotedMessageIds(sql: Sql): LogPayload {
  const rows = sql.all(
    DIALOGUE_ROW,
    `select id, embeds from assistant_messages
     where exists (select 1 from json_each(embeds) where json_extract(value, '$.kind') = '${DIALOGUE_KIND}')`,
  );
  let quoted = 0;
  for (const row of rows) {
    const embeds = EMBEDS.parse(row.embeds);
    const quotedId = quotedIdOf(embeds);
    const quote = quotedId === null ? null : quoteOf(sql, quotedId);
    if (quote !== null) quoted += 1;
    sql.run(
      'move the helper reply quote into the structured quote',
      'update assistant_messages set embeds = $embeds, quote = $quote where id = $id',
      { id: row.id, embeds: jsonText(withoutQuoteId(embeds)), quote },
    );
  }
  return { helperMessages: rows.length, quoted };
}

export const MESSAGE_QUOTES_MIGRATION: Migration = {
  version: 187,
  name: 'message-quotes',
  statements: [
    'alter table assistant_messages add column quote text check (quote is null or json_valid(quote))',
  ],
  backfill: foldQuotedMessageIds,
};
