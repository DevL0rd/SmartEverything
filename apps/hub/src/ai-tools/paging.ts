import { z } from 'zod';

export const OFFSET = z.number().int().min(0).default(0);

export interface More {
  readonly total: number;
  readonly next_offset: number;
}

export interface Paged<T> {
  readonly rows: T[];
  readonly more: More | null;
}

export function paged<T>(rows: readonly T[], offset: number, limit: number): Paged<T> {
  const page = rows.slice(offset, offset + limit);
  const next = offset + page.length;
  return {
    rows: page,
    more: next < rows.length ? { total: rows.length, next_offset: next } : null,
  };
}

export function moreOf(more: More | null): { readonly more?: More } {
  return more === null ? {} : { more };
}
