import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { BROWSER_METADATA, loadBrowserMetadata, migrateBrowserMetadata } from './browser-metadata';
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
  chatListOpen: z.boolean(),
  lastChat: z.string().nullable(),
  chatPanelOpen: z.boolean(),
  developerFlags: z.record(z.string(), z.boolean()),
});

type Values = z.infer<typeof LOCAL_PREFS>;

export type LocalPrefKey = keyof Values;

export type LocalPrefValue<K extends LocalPrefKey> = Values[K];

const STORAGE_KEY = 'smarteverything.local-prefs';

const STORED = LOCAL_PREFS.partial().extend({ browserTabs: BROWSER_METADATA.optional() });

const defaults: Values = {
  sidebarCollapsed: false,
  recentSearches: [],
  lastFitnessTab: 'today',
  talkEnabled: false,
  talkMode: 'hold',
  talkChannel: '',
  talkHeadset: false,
  aiPanelOpen: true,
  chatListOpen: true,
  lastChat: null,
  chatPanelOpen: false,
  developerFlags: {},
};

const values = new ValueStore<Values>(defaults);

export type LocalPrefsStatus = 'loading' | 'ready' | 'failed';

const status = new ValueStore<LocalPrefsStatus>('loading');

async function readStored(): Promise<void> {
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
  const { browserTabs, ...preferences } = parsed.data;
  if (browserTabs !== undefined) {
    await migrateBrowserMetadata(browserTabs);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }
  values.set(LOCAL_PREFS.parse({ ...defaults, ...preferences }));
}

async function loadOnce(): Promise<void> {
  try {
    await loadBrowserMetadata();
    await readStored();
    status.set('ready');
  } catch (error) {
    status.set('failed');
    throw error;
  }
}

let loading: Promise<void> | null = null;

export function loadLocalPrefs(): Promise<void> {
  loading ??= loadOnce();
  return loading;
}

export function useLocalPrefsStatus(): LocalPrefsStatus {
  return useValue(status);
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
