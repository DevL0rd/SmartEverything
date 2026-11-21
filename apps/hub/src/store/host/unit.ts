import type { HostStore } from './host-store';

export interface StoreUnit<I, O> {
  readonly run: (store: HostStore, input: I) => O;
  readonly durable: boolean;
  readonly bare?: true;
}

export function storeUnit<I, O>(run: (store: HostStore, input: I) => O): StoreUnit<I, O> {
  return { run, durable: false };
}

export function durableStoreUnit<I, O>(run: (store: HostStore, input: I) => O): StoreUnit<I, O> {
  return { run, durable: true };
}

export function bareStoreUnit<I, O>(run: (store: HostStore, input: I) => O): StoreUnit<I, O> {
  return { run, durable: false, bare: true };
}

export type UnitInput<U> = U extends StoreUnit<infer I, unknown> ? I : never;

export type UnitOutput<U> = U extends StoreUnit<never, infer O> ? Awaited<O> : never;
