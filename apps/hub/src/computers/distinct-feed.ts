import { isDeepStrictEqual } from 'node:util';

export class DistinctFeed<T> {
  private readonly listeners = new Set<(value: T) => void>();
  private readonly last = new Map<string, T>();

  on(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  emit(key: string, value: T): void {
    if (isDeepStrictEqual(this.last.get(key), value)) return;
    this.last.set(key, value);
    for (const listener of this.listeners) listener(value);
  }

  clear(): void {
    this.listeners.clear();
    this.last.clear();
  }
}
