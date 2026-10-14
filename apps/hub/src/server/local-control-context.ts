import { AsyncLocalStorage } from 'node:async_hooks';
import type { Caller } from './auth';

const callers = new AsyncLocalStorage<Caller>();
export function currentControlCaller(): Caller | undefined {
  return callers.getStore();
}
export function withControlCaller<T>(caller: Caller, run: () => T): T {
  return callers.run(caller, run);
}
