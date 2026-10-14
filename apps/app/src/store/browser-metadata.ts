import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { jsonText } from '../format/json-text';

export const BROWSER_METADATA = z.record(z.string(), z.unknown());
const KEY = 'smarteverything.browser-tabs';
const log = new Logger('app.browser-metadata');
let values: Readonly<Record<string, unknown>> = {};
let writes = Promise.resolve();
export async function loadBrowserMetadata(): Promise<void> {
  const text = await AsyncStorage.getItem(KEY);
  if (text === null) return;
  const read = jsonText(text);
  if (!read.ok) throw new Error('The saved browser tabs are unreadable.');
  values = BROWSER_METADATA.parse(read.value);
}
export function browserMetadata(key: string): unknown {
  return values[key];
}
function save(next: Readonly<Record<string, unknown>>): Promise<void> {
  values = next;
  writes = writes
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(KEY, JSON.stringify(next)));
  return writes;
}
export async function migrateBrowserMetadata(
  legacy: Readonly<Record<string, unknown>>,
): Promise<void> {
  await save({ ...legacy, ...values });
}
export function setBrowserMetadata(key: string, value: unknown): void {
  void save({ ...values, [key]: value }).catch((cause: unknown) => {
    log.warn('browser.tabs_not_saved', { reason: String(cause) });
  });
}
export function forgetBrowserMetadata(key: string): void {
  void save(Object.fromEntries(Object.entries(values).filter(([known]) => known !== key))).catch(
    (cause: unknown) => {
      log.warn('browser.tabs_not_saved', { reason: String(cause) });
    },
  );
}
