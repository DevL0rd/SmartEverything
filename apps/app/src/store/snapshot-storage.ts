import { delMany, getMany, setMany } from 'idb-keyval';

export async function readStored(keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const values = await getMany<string>([...keys]);
  const texts = new Map<string, string>();
  keys.forEach((key, index) => {
    const value = values[index];
    if (typeof value === 'string') texts.set(key, value);
  });
  return texts;
}

export async function writeStored(
  entries: readonly (readonly [string, string])[],
  removed: readonly string[],
): Promise<void> {
  await Promise.all([
    entries.length === 0 ? undefined : setMany(entries.map(([key, text]) => [key, text])),
    removed.length === 0 ? undefined : delMany([...removed]),
  ]);
}

export function removeStored(keys: readonly string[]): Promise<void> {
  return delMany([...keys]);
}
