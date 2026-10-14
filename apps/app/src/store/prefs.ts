import { useMemo } from 'react';
import {
  API_ENDPOINTS as E,
  CLIENT_PREFS,
  layoutScopeOf,
  type ClientPrefDefinition,
  type JsonValue,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../api/transport';
import { notify } from '../components/toast-store';
import type { EntityStore } from './entity-store';
import { applyChange } from './live-reducers';
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
  cameras: CLIENT_PREFS.cameras,
  healthSync: CLIENT_PREFS.health_sync,
  nutrition: CLIENT_PREFS.nutrition,
  region: CLIENT_PREFS.region,
} as const;

function writeLayoutRow(
  store: EntityStore,
  page: string,
  layout: Readonly<Record<string, JsonValue>>,
): void {
  store.update((state) => {
    const session = state.session;
    if (session === null) {
      return state;
    }
    const clientScoped = layoutScopeOf(page) === 'client';
    const record = {
      client_id: clientScoped ? session.client.id : null,
      profile_id: clientScoped ? null : session.client.profile_id,
      page,
      layout: { ...layout },
      updated_at: new Date().toISOString(),
    };
    return applyChange(state, {
      type: 'change',
      table: 'layouts',
      operation: 'UPDATE',
      record,
      oldRecord: null,
    });
  });
}

export function saveStoredLayout(
  store: EntityStore,
  page: string,
  layout: Readonly<Record<string, JsonValue>>,
  failure: string,
): void {
  const previous = store.get().tables.layouts.byId[page];
  writeLayoutRow(store, page, layout);
  api()
    .call(E.saveLayout, { params: { page }, body: { layout: { ...layout } } })
    .then(() => {
      log.info('layout.saved', { page });
    })
    .catch((error: unknown) => {
      if (previous !== undefined) {
        writeLayoutRow(store, page, previous.layout);
      }
      notify({ message: failure, error, tone: 'critical' });
    });
}

export function savePref<T>(store: EntityStore, pref: Pref<T>, value: T): void {
  saveStoredLayout(store, pref.storageKey, pref.encode(value), 'Your change was not saved');
}

export function usePref<T>(pref: Pref<T>): PrefRead<T> {
  const store = useEntityStore();
  const stored = useStoreSelector(
    (state) => state.tables.layouts.byId[pref.storageKey] ?? null,
    Object.is,
    [pref.storageKey],
  );
  const read = useMemo(() => {
    if (stored !== null && (stored.client_id !== null) !== (pref.scope === 'client'))
      return {
        status: 'invalid' as const,
        reason: `The saved ${pref.storageKey} preference has the wrong ${pref.scope} scope.`,
      };
    return pref.decode(stored?.layout ?? null);
  }, [pref, stored]);
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
