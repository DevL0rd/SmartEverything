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
