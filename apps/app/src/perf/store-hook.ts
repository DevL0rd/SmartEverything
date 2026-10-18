import { sinkOf } from './sink';

export function perfStoreChanged(previous: object, next: object, listeners: number): void {
  if (__DEV__) sinkOf()?.store(previous, next, listeners);
}
