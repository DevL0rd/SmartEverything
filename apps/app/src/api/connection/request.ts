import { z } from 'zod';
import type { EndpointShape } from '@smarteverything/domain';

type Empty = Record<never, never>;

type RequiredKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

type RequiredQueryKeys<Q extends z.ZodType> = Extract<keyof z.output<Q>, RequiredKeys<z.input<Q>>>;

type QueryArguments<Q extends z.ZodType> = Readonly<Pick<z.output<Q>, RequiredQueryKeys<Q>>> &
  Partial<Readonly<Omit<z.output<Q>, RequiredQueryKeys<Q>>>>;

type Slot<K extends string, T> = undefined extends T
  ? Partial<Readonly<Record<K, T>>>
  : Empty extends T
    ? Partial<Readonly<Record<K, T>>>
    : Readonly<Record<K, T>>;

export interface TypedEndpoint<
  P extends z.ZodType,
  Q extends z.ZodType,
  B extends z.ZodType,
  R extends z.ZodType,
> extends EndpointShape {
  readonly params: P;
  readonly query: Q;
  readonly body: B;
  readonly response: R;
}

export type CallInput<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType> = Slot<
  'params',
  z.input<P>
> &
  Slot<'query', QueryArguments<Q>> &
  Slot<'body', z.input<B>>;

export const WIRE_QUERY = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.undefined()]),
);

export type WireQuery = Readonly<Record<string, string>>;

export function wireQueryOf(query: z.output<typeof WIRE_QUERY>): WireQuery {
  const wire: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      wire[key] = Array.isArray(value) ? value.join(',') : String(value);
    }
  }
  return wire;
}
