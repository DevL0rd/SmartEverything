import AsyncStorage from '@react-native-async-storage/async-storage';

export async function readStored(keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const entries = await AsyncStorage.multiGet([...keys]);
  const texts = new Map<string, string>();
  entries.forEach(([key, value]) => {
    if (value !== null) texts.set(key, value);
  });
  return texts;
}

export function writeStored(key: string, text: string): Promise<void> {
  return AsyncStorage.setItem(key, text);
}

export function removeStored(keys: readonly string[]): Promise<void> {
  return AsyncStorage.multiRemove([...keys]);
}
