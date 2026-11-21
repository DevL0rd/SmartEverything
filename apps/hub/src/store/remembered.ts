import type { StoreContext } from './context';

export class Remembered<V> {
  private readonly known = new WeakMap<StoreContext, Map<string, { readonly value: V }>>();

  value(context: StoreContext, key: string, read: () => V): V {
    if (context.sql.inTransaction()) return read();
    const known = this.knownOf(context);
    const held = known.get(key);
    if (held !== undefined) return held.value;
    const value = read();
    known.set(key, { value });
    return value;
  }

  forget(context: StoreContext): void {
    this.known.get(context)?.clear();
  }

  private knownOf(context: StoreContext): Map<string, { readonly value: V }> {
    const existing = this.known.get(context);
    if (existing !== undefined) return existing;
    const created = new Map<string, { readonly value: V }>();
    this.known.set(context, created);
    context.onForeignCommit(() => {
      created.clear();
    });
    return created;
  }
}
