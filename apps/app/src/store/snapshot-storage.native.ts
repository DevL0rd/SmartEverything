import AsyncStorage from '@react-native-async-storage/async-storage';

export async function readStored(keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const entries = await AsyncStorage.multiGet([...keys]);
  const texts = new Map<string, string>();
  entries.forEach(([key, value]) => {
    if (value !== null) texts.set(key, value);
  });
  return texts;
}

export async function writeStored(
  entries: readonly (readonly [string, string])[],
  removed: readonly string[],
): Promise<void> {
  await Promise.all([
    entries.length === 0
      ? undefined
      : AsyncStorage.multiSet(entries.map(([key, text]): [string, string] => [key, text])),
    removed.length === 0 ? undefined : AsyncStorage.multiRemove([...removed]),
  ]);
}

export function removeStored(keys: readonly string[]): Promise<void> {
  return AsyncStorage.multiRemove([...keys]);
}
