import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import {
  ANDROID_APP_BUILD,
  APP_UPDATE_CHANNELS,
  DEFAULT_OVERLAY_PREFS,
  OVERLAY_PREFS,
  VACUUM_FINISH,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { loadBrowserMetadata } from './browser-metadata';
import { jsonText } from '../format/json-text';
import { ValueStore, usePausable, useValue } from '../design/external-store';

const log = new Logger('app.local-prefs');

export const QUICK_ASK_SHORTCUTS = ['space', 'shift-space', 'alt-space'] as const;

const LOCAL_PREFS = z.strictObject({
  sidebarCollapsed: z.boolean(),
  navFoldersOpen: z.array(z.string()),
  recentSearches: z.array(z.string()).max(12),
  photoSearches: z.array(z.string()),
  lastFitnessTab: z.string(),
  talkEnabled: z.boolean(),
  talkMode: z.enum(['hold', 'tap']),
  talkChannel: z.string(),
  talkHeadset: z.boolean(),
  aiPanelOpen: z.boolean(),
  chatListOpen: z.boolean(),
  lastChat: z.string().nullable(),
  chatSeenAt: z.number().int().nullable(),
  chatPanelOpen: z.boolean(),
  chatPanels: z.record(z.string(), z.strictObject({ open: z.boolean() })),
  browserDockWidth: z.number().positive().nullable(),
  developerFlags: z.record(z.string(), z.boolean()),
  quickAskShortcut: z.enum(QUICK_ASK_SHORTCUTS),
  overlay: OVERLAY_PREFS,
  overlayBannerSeen: z.boolean(),
  sideKeyAssistant: z.boolean(),
  setupSkipped: z.array(z.string()),
  setupReach: z.enum(['home', 'away']).nullable(),
  vacuumFinishes: z.record(z.string(), VACUUM_FINISH),
  voiceClips: z.strictObject({
    played: z.array(z.string()),
    speed: z.union([z.literal(1), z.literal(1.5), z.literal(2)]),
  }),
  appUpdates: z.strictObject({
    channel: z.enum(APP_UPDATE_CHANNELS),
    launchedId: z.uuid().nullable(),
    pendingId: z.union([z.uuid(), z.literal('built_in')]).nullable(),
  }),
  hubUpdateNotices: z.record(z.string(), z.array(z.string())),
  androidInstall: z
    .strictObject({ versionCode: ANDROID_APP_BUILD.shape.versionCode, appVersion: z.string() })
    .nullable(),
});

const STORED_WITH_FAILED_ID = z.looseObject({
  appUpdates: z.strictObject({
    channel: z.enum(APP_UPDATE_CHANNELS),
    failedId: z.uuid().nullable(),
    pendingId: z.union([z.uuid(), z.literal('built_in')]).nullable(),
  }),
});

export function migrateStoredPrefs(value: unknown): {
  readonly value: unknown;
  readonly changed: boolean;
} {
  const old = STORED_WITH_FAILED_ID.safeParse(value);
  if (!old.success) return { value, changed: false };
  const { channel, pendingId } = old.data.appUpdates;
  return {
    value: {
      ...old.data,
      appUpdates: { channel, pendingId, launchedId: pendingId === 'built_in' ? null : pendingId },
    },
    changed: true,
  };
}

type Values = z.infer<typeof LOCAL_PREFS>;

export type LocalPrefKey = keyof Values;

export type LocalPrefValue<K extends LocalPrefKey> = Values[K];

const STORAGE_KEY = 'smarteverything.local-prefs';

const STORED = z.object(LOCAL_PREFS.shape).partial();

const defaults: Values = {
  sidebarCollapsed: false,
  navFoldersOpen: [],
  recentSearches: [],
  photoSearches: [],
  lastFitnessTab: 'today',
  talkEnabled: false,
  talkMode: 'hold',
  talkChannel: '',
  talkHeadset: false,
  aiPanelOpen: true,
  chatListOpen: true,
  lastChat: null,
  chatSeenAt: null,
  chatPanelOpen: false,
  chatPanels: {},
  browserDockWidth: null,
  developerFlags: {},
  quickAskShortcut: 'space',
  overlay: DEFAULT_OVERLAY_PREFS,
  overlayBannerSeen: false,
  sideKeyAssistant: false,
  setupSkipped: [],
  setupReach: null,
  vacuumFinishes: {},
  voiceClips: { played: [], speed: 1 },
  appUpdates: { channel: 'release', launchedId: null, pendingId: null },
  hubUpdateNotices: {},
  androidInstall: null,
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
  const migration = read.ok ? migrateStoredPrefs(read.value) : null;
  const parsed = migration === null ? null : STORED.safeParse(migration.value);
  if (parsed?.success !== true) {
    log.warn('local_prefs.unreadable', { stored: text.slice(0, 200) });
    throw new Error('The preferences saved on this device are unreadable and were not applied.');
  }
  values.set(LOCAL_PREFS.parse({ ...defaults, ...parsed.data }));
  if (migration?.changed === true)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(values.get()));
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
  return usePausable(values.subscribe, () => values.get()[key]);
}

export function localPref<K extends LocalPrefKey>(key: K): LocalPrefValue<K> {
  return values.get()[key];
}
