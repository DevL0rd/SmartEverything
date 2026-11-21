import { useMemo } from 'react';
import {
  API_ENDPOINTS as E,
  CLIENT_PREFS,
  layoutScopeOf,
  type ClientPrefDefinition,
  type ClientPrefRead,
  type JsonValue,
  type LayoutRow,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../api/transport';
import { notify } from '../components/toast-store';
import type { EntityStore } from './entity-store';
import { liveRowEdit, writeOptimistically } from './optimistic';
import type { StoreState } from './state';
import { useEntityStore, useStoreSelector } from './store-context';

const log = new Logger('app.layouts');

export type PrefRead<T> =
  | { readonly status: 'ready'; readonly value: T; readonly set: (value: T) => void }
  | { readonly status: 'invalid'; readonly reason: string; readonly reset: () => void };

export type Pref<T> = ClientPrefDefinition<T>;

export const PREFS = {
  aiSpeech: CLIENT_PREFS.ai_speech,
  appearance: CLIENT_PREFS.appearance,
  callAudio: CLIENT_PREFS.call_audio,
  callRing: CLIENT_PREFS.call_ring,
  cameraNotifications: CLIENT_PREFS.camera_notifications,
  cameras: CLIENT_PREFS.cameras,
  clockFormat: CLIENT_PREFS.clock_format,
  deviceAlerts: CLIENT_PREFS.device_alerts,
  driveHints: CLIENT_PREFS.drive_hints,
  driveNotifications: CLIENT_PREFS.drive_notifications,
  healthSync: CLIENT_PREFS.health_sync,
  homeMapLook: CLIENT_PREFS.home_map_look,
  homeMapView: CLIENT_PREFS.home_map_view,
  navigation: CLIENT_PREFS.navigation,
  navigationDevice: CLIENT_PREFS.navigation_device,
  nutrition: CLIENT_PREFS.nutrition,
  photos: CLIENT_PREFS.photos,
  photosBackup: CLIENT_PREFS.photos_backup,
  region: CLIENT_PREFS.region,
  sharedClipboard: CLIENT_PREFS.shared_clipboard,
} as const;

function layoutRow(
  session: NonNullable<StoreState['session']>,
  page: string,
  layout: Readonly<Record<string, JsonValue>>,
): LayoutRow {
  const clientScoped = layoutScopeOf(page) === 'client';
  return {
    client_id: clientScoped ? session.client.id : null,
    profile_id: clientScoped ? null : session.client.profile_id,
    page,
    layout: { ...layout },
    updated_at: new Date().toISOString(),
  };
}

export function saveStoredLayout(
  store: EntityStore,
  page: string,
  layout: Readonly<Record<string, JsonValue>>,
  failure: string,
): void {
  const session = store.get().session;
  if (session === null) return;
  const previous = store.get().tables.layouts.byId[page] ?? null;
  const record = layoutRow(session, page, layout);
  log.debug('layout.save_requested', () => ({ page, keys: Object.keys(layout).length }));
  writeOptimistically(store, {
    event: 'layout.save',
    edits: [liveRowEdit('layouts', page, previous, record)],
    send: () => api().call(E.saveLayout, { params: { page }, body: { layout: { ...layout } } }),
    fields: { page },
  }).catch((error: unknown) => {
    notify({ message: failure, error, tone: 'critical' });
  });
}

export function savePref<T>(store: EntityStore, pref: Pref<T>, value: T): void {
  saveStoredLayout(store, pref.storageKey, pref.encode(value), 'Your change was not saved');
}

export function storedPrefOf<T>(pref: Pref<T>, stored: LayoutRow | null): ClientPrefRead<T> {
  if (stored !== null && (stored.client_id !== null) !== (pref.scope === 'client'))
    return {
      status: 'invalid',
      reason: `The saved ${pref.storageKey} preference has the wrong ${pref.scope} scope.`,
    };
  return pref.decode(stored?.layout ?? null);
}

export function prefOf<T>(state: StoreState, pref: Pref<T>): ClientPrefRead<T> {
  return storedPrefOf(pref, state.tables.layouts.byId[pref.storageKey] ?? null);
}

export function prefValueOf<T>(state: StoreState, pref: Pref<T>): T {
  const read = prefOf(state, pref);
  return read.status === 'invalid' ? pref.defaultValue : read.value;
}

export function usePref<T>(pref: Pref<T>): PrefRead<T> {
  const store = useEntityStore();
  const stored = useStoreSelector(
    (state) => state.tables.layouts.byId[pref.storageKey] ?? null,
    Object.is,
    [pref.storageKey],
  );
  const read = useMemo(() => storedPrefOf(pref, stored), [pref, stored]);
  if (read.status === 'invalid') {
    return {
      status: 'invalid',
      reason: read.reason,
      reset: (): void => {
        savePref(store, pref, pref.defaultValue);
      },
    };
  }
  return {
    status: 'ready',
    value: read.value,
    set: (value): void => {
      savePref(store, pref, value);
    },
  };
}
