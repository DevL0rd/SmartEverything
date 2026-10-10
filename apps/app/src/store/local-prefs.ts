import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { jsonText } from '../format/json-text';
import { ValueStore, useValue } from '../design/external-store';

const log = new Logger('app.local-prefs');

const LOCAL_PREFS = z.strictObject({
  sidebarCollapsed: z.boolean(),
  recentSearches: z.array(z.string()).max(12),
  lastFitnessTab: z.string(),
  talkEnabled: z.boolean(),
  talkMode: z.enum(['hold', 'tap']),
  talkChannel: z.string(),
  talkHeadset: z.boolean(),
  aiPanelOpen: z.boolean(),
});

type Values = z.infer<typeof LOCAL_PREFS>;

export type LocalPrefKey = keyof Values;

export type LocalPrefValue<K extends LocalPrefKey> = Values[K];

const STORAGE_KEY = 'smarteverything.local-prefs';

const STORED = LOCAL_PREFS.partial();

const defaults: Values = {
  sidebarCollapsed: false,
  recentSearches: [],
  lastFitnessTab: 'today',
  talkEnabled: false,
  talkMode: 'hold',
  talkChannel: '',
  talkHeadset: false,
  aiPanelOpen: true,
};

const values = new ValueStore<Values>(defaults);

export async function loadLocalPrefs(): Promise<void> {
  const text = await AsyncStorage.getItem(STORAGE_KEY);
  if (text === null) {
    return;
  }
  const read = jsonText(text);
  const parsed = read.ok ? STORED.safeParse(read.value) : null;
  if (parsed?.success !== true) {
    log.warn('local_prefs.unreadable', { stored: text.slice(0, 200) });
    throw new Error('The preferences saved on this device are unreadable and were not applied.');
  }
  values.set(LOCAL_PREFS.parse({ ...defaults, ...parsed.data }));
}

export function setLocalPref<K extends LocalPrefKey>(key: K, value: LocalPrefValue<K>): void {
  const next = { ...values.get(), [key]: value };
  values.set(next);
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((error: unknown) => {
    log.warn('local_prefs.not_saved', { reason: String(error) });
  });
}

export function useLocalPref<K extends LocalPrefKey>(key: K): LocalPrefValue<K> {
  return useValue(values)[key];
}

export function localPref<K extends LocalPrefKey>(key: K): LocalPrefValue<K> {
  return values.get()[key];
}
