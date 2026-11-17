import type { StoreContext } from './context';

export class Remembered<V> {
  private readonly known = new WeakMap<StoreContext, Map<string, V>>();

  value(context: StoreContext, key: string, read: () => V): V {
    if (context.sql.inTransaction()) return read();
    const known = this.knownOf(context);
    if (known.has(key)) return this.held(known, key, read);
    const value = read();
    known.set(key, value);
    return value;
  }

  forget(context: StoreContext): void {
    this.known.get(context)?.clear();
  }

  private held(known: Map<string, V>, key: string, read: () => V): V {
    const value = known.get(key);
    return value === undefined ? read() : value;
  }

  private knownOf(context: StoreContext): Map<string, V> {
    const existing = this.known.get(context);
    if (existing !== undefined) return existing;
    const created = new Map<string, V>();
    this.known.set(context, created);
    return created;
  }
}
