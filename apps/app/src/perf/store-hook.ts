import { sinkOf } from './sink';

export function perfStoreChanged(previous: object, next: object, listeners: number): void {
  sinkOf()?.store(previous, next, listeners);
}
