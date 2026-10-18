import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import type { Sql } from '../sql';

const AUDIO_TOKENS_PER_SECOND = 32;

const LIVE_MODEL = 'google:gemini-3.8-live';

const RATE = z.number().nullable();

const PRICING = z.looseObject({
  input_per_mtok: RATE,
  audio_in_per_mtok: RATE,
  output_per_mtok: RATE,
  audio_out_per_mtok: RATE,
});

const PRICED = z.object({
  input_per_mtok: z.number(),
  audio_in_per_mtok: z.number(),
  output_per_mtok: z.number(),
  audio_out_per_mtok: z.number(),
});

type Pricing = z.output<typeof PRICING>;

const SHIPPED: Readonly<Record<string, Pricing>> = {
  [LIVE_MODEL]: {
    input_per_mtok: 0.75,
    audio_in_per_mtok: 3,
    output_per_mtok: 4.5,
    audio_out_per_mtok: 12,
  },
};

const LIVE_ROW = z.strictObject({
  id: z.string(),
  model_id: z.string(),
  chat_id: z.string().nullable(),
  message_id: z.string().nullable(),
  tokens_in: z.int().min(0),
  tokens_out: z.int().min(0),
  tokens_reasoning: z.int().min(0),
  audio_in_ms: z.int().min(0),
  audio_out_ms: z.int().min(0),
  cost_micros: z.int().min(0),
});

type LiveRow = z.output<typeof LIVE_ROW>;

class MissingLivePriceError extends Error {
  override readonly name = 'MissingLivePriceError';

  constructor(modelId: string) {
    super(`The shipped price table has no text and audio prices for ${modelId}.`);
  }
}

const OVERRIDES = z.strictObject({
  prices: z.string().nullable(),
});

const PRICE_TABLE = z.record(z.string(), PRICING);

type Overrides = Readonly<Record<string, Pricing>>;

function overridesOf(sql: Sql): Overrides {
  const row = sql.get(
    OVERRIDES,
    "select json_extract(settings, '$.google_prices') as prices from ai_settings where key = 'openrouter'",
  );
  const text = row === undefined ? null : row.prices;
  return text === null ? {} : PRICE_TABLE.parse(JSON.parse(text));
}

function rates(modelId: string, overrides: Overrides): readonly [number, number, number, number] {
  const priced = PRICED.safeParse(overrides[modelId] ?? SHIPPED[modelId]);
  if (!priced.success) {
    throw new MissingLivePriceError(modelId);
  }
  const { input_per_mtok, audio_in_per_mtok, output_per_mtok, audio_out_per_mtok } = priced.data;
  return [input_per_mtok, audio_in_per_mtok, output_per_mtok, audio_out_per_mtok];
}

function audioTokens(milliseconds: number): number {
  return Math.round((milliseconds * AUDIO_TOKENS_PER_SECOND) / 1000);
}

function repriced(row: LiveRow, overrides: Overrides): number {
  const [textIn, audioIn, textOut, audioOut] = rates(row.model_id, overrides);
  const heard = audioTokens(row.audio_in_ms);
  const said = audioTokens(row.audio_out_ms);
  return Math.round(
    Math.max(0, row.tokens_in - heard) * textIn +
      heard * audioIn +
      Math.max(0, row.tokens_out - said) * textOut +
      said * audioOut +
      row.tokens_reasoning * textOut,
  );
}

function shift(sql: Sql, row: LiveRow, delta: number): void {
  if (row.message_id !== null) {
    sql.run(
      'reprice the call message',
      'update assistant_messages set cost_micros = max(0, cost_micros + $delta) where id = $id',
      { delta, id: row.message_id },
    );
  }
  if (row.chat_id !== null) {
    sql.run(
      'reprice the call chat',
      'update ai_chats set cost_micros = max(0, cost_micros + $delta) where id = $id',
      { delta, id: row.chat_id },
    );
  }
}

export function repriceLiveUsage(sql: Sql): LogPayload {
  const rows = sql.all(
    LIVE_ROW,
    `select id, model_id, chat_id, message_id, tokens_in, tokens_out, tokens_reasoning,
      audio_in_ms, audio_out_ms, cost_micros from ai_usage
      where source = 'gemini_live' and model_id is not null`,
  );
  const overrides = overridesOf(sql);
  let before = 0;
  let after = 0;
  for (const row of rows) {
    const cost = repriced(row, overrides);
    before += row.cost_micros;
    after += cost;
    sql.run(
      'reprice a Gemini Live turn',
      'update ai_usage set cost_micros = $cost where id = $id',
      {
        cost,
        id: row.id,
      },
    );
    shift(sql, row, cost - row.cost_micros);
  }
  return { rows: rows.length, beforeMicros: before, afterMicros: after };
}
