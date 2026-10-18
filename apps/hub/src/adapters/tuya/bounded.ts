export async function mapBounded<Item, Result>(
  items: readonly Item[],
  limit: number,
  work: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = [];
  const queue = items.entries();
  const lane = async (): Promise<void> => {
    for (const [index, item] of queue) {
      results[index] = await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

export class LoadOnce<Value> {
  private readonly entries = new Map<string, Promise<Value>>();

  get(key: string, load: () => Promise<Value>): Promise<Value> {
    const known = this.entries.get(key);
    if (known !== undefined) {
      return known;
    }
    const loading = load();
    this.entries.set(key, loading);
    // eslint-disable-next-line local/no-swallowed-errors -- the caller awaits the same load and receives its failure
    loading.catch(() => {
      this.entries.delete(key);
    });
    return loading;
  }
}
