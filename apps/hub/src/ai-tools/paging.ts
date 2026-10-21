import { z } from 'zod';

export const CURSOR = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/u, 'cursor must be the nextCursor of the previous page')
  .optional()
  .describe('nextCursor of the previous page');

export interface More {
  readonly total: number;
  readonly nextCursor: string;
}

export interface Paged<T> {
  readonly rows: T[];
  readonly more: More | null;
}

export function paged<T>(rows: readonly T[], cursor: string | undefined, limit: number): Paged<T> {
  const offset = cursor === undefined ? 0 : Number(cursor);
  const page = rows.slice(offset, offset + limit);
  const next = offset + page.length;
  return {
    rows: page,
    more: next < rows.length ? { total: rows.length, nextCursor: String(next) } : null,
  };
}

export function moreOf(more: More | null): { readonly more?: More } {
  return more === null ? {} : { more };
}
