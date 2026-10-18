import { delMany, getMany, set } from 'idb-keyval';

export async function readStored(keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const values = await getMany<string>([...keys]);
  const texts = new Map<string, string>();
  keys.forEach((key, index) => {
    const value = values[index];
    if (typeof value === 'string') texts.set(key, value);
  });
  return texts;
}

export function writeStored(key: string, text: string): Promise<void> {
  return set(key, text);
}

export function removeStored(keys: readonly string[]): Promise<void> {
  return delMany([...keys]);
}
