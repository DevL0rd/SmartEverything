import { z } from 'zod';
import { SQL_FLAG, SQL_JSON } from './sql';

export interface Codec {
  readonly flags?: readonly string[];
  readonly json?: readonly string[];
}

const RAW_ROW = z.record(z.string(), z.unknown());

function converted(raw: Readonly<Record<string, unknown>>, codec: Codec): Record<string, unknown> {
  const row: Record<string, unknown> = { ...raw };
  for (const column of codec.flags ?? []) {
    row[column] = SQL_FLAG.parse(raw[column]);
  }
  for (const column of codec.json ?? []) {
    const text = raw[column];
    row[column] = text === null ? null : SQL_JSON.parse(text);
  }
  return row;
}

export function storedRow<S extends z.ZodType>(row: S, codec: Codec): z.ZodType<z.output<S>> {
  return RAW_ROW.transform((raw): z.output<S> => row.parse(converted(raw, codec)));
}
