import { z } from 'zod';
import { SQL_FLAG, SQL_JSON } from './sql';

export interface Codec {
  readonly flags?: readonly string[];
  readonly nullableFlags?: readonly string[];
  readonly json?: readonly string[];
}

const RAW_ROW = z.custom<Readonly<Record<string, unknown>>>(
  (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  'A database row must be an object of columns.',
);

function converted(raw: Readonly<Record<string, unknown>>, codec: Codec): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const column of Object.keys(raw)) row[column] = raw[column];
  for (const column of codec.flags ?? []) {
    row[column] = SQL_FLAG.parse(row[column]);
  }
  for (const column of codec.nullableFlags ?? []) {
    row[column] = row[column] === null ? null : SQL_FLAG.parse(row[column]);
  }
  for (const column of codec.json ?? []) {
    const text = row[column];
    row[column] = text === null ? null : SQL_JSON.parse(text);
  }
  return row;
}

export function storedRow<S extends z.ZodType>(row: S, codec: Codec): z.ZodType<z.output<S>> {
  return RAW_ROW.transform((raw): z.output<S> => row.parse(converted(raw, codec)));
}

export function builtRow<T>(
  build: (row: Readonly<Record<string, unknown>>) => T,
  codec: Codec,
): z.ZodType<T> {
  return RAW_ROW.transform((raw): T => build(converted(raw, codec)));
}
