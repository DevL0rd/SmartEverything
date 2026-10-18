import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { jsonText } from '../format/json-text';

const BROWSER_METADATA = z.record(z.string(), z.unknown());
const KEY = 'smarteverything.browser-tabs';
const log = new Logger('app.browser-metadata');
let values: Readonly<Record<string, unknown>> = {};
let writes = Promise.resolve();
export async function loadBrowserMetadata(): Promise<void> {
  const text = await AsyncStorage.getItem(KEY);
  if (text === null) return;
  const read = jsonText(text);
  const parsed = read.ok ? BROWSER_METADATA.safeParse(read.value) : null;
  if (parsed?.success === true) values = parsed.data;
  else log.warn('browser.tabs_unreadable', { length: text.length });
}
export function browserMetadata(key: string): unknown {
  return values[key];
}
function save(next: Readonly<Record<string, unknown>>): void {
  values = next;
  writes = writes
    .then(() => AsyncStorage.setItem(KEY, JSON.stringify(next)))
    .catch((cause: unknown) => {
      log.warn('browser.tabs_not_saved', { reason: String(cause) });
    });
}
export function setBrowserMetadata(key: string, value: unknown): void {
  save({ ...values, [key]: value });
}
export function forgetBrowserMetadataWhere(forgotten: (key: string) => boolean): void {
  save(Object.fromEntries(Object.entries(values).filter(([key]) => !forgotten(key))));
}
