import type { Store } from '../store';

export interface StoreUnit<I, O> {
  readonly run: (store: Store, input: I) => O;
  readonly durable: boolean;
}

export function storeUnit<I, O>(run: (store: Store, input: I) => O): StoreUnit<I, O> {
  return { run, durable: false };
}

export function durableStoreUnit<I, O>(run: (store: Store, input: I) => O): StoreUnit<I, O> {
  return { run, durable: true };
}

export type UnitInput<U> = U extends StoreUnit<infer I, unknown> ? I : never;

export type UnitOutput<U> = U extends StoreUnit<never, infer O> ? Awaited<O> : never;
