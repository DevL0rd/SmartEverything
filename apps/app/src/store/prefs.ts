import { useMemo } from 'react';
import {
  API_ENDPOINTS as E,
  CLIENT_PREFS,
  layoutScopeOf,
  type ClientPrefDefinition,
  type JsonValue,
  type LayoutRow,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../api/transport';
import { connectionState } from '../api/connection/connection';
import { notify } from '../components/toast-store';
import type { EntityStore } from './entity-store';
import {
  acknowledgeLayoutWrite,
  beginLayoutWrite,
  layoutWriteScope,
  refuseLayoutWrite,
} from './layout-writes';
import { serverSupportsLayoutWrites } from '../api/connection/server-capabilities';
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

const tails = new WeakMap<EntityStore, Map<string, Promise<void>>>();

function ownsLayoutScope(
  store: EntityStore,
  scope: string,
  client: ReturnType<typeof api>,
): boolean {
  return (
    layoutWriteScope(store.get()) === scope &&
    connectionState.get().status === 'paired' &&
    api() === client
  );
}

function retainLayoutWrite(
  store: EntityStore,
  scope: string,
  client: ReturnType<typeof api>,
  pending: { readonly page: string; readonly request: symbol },
): boolean {
  if (ownsLayoutScope(store, scope, client)) return true;
  store.update((state) => refuseLayoutWrite(state, pending.page, pending.request, scope));
  return false;
}

class LayoutSequenceError extends Error {
  override readonly name = 'LayoutSequenceError';
  constructor(readonly page: string) {
    super(`The server confirmed ${page} without its advertised live sequence.`);
  }
}

function layoutRow(
  store: EntityStore,
  page: string,
  layout: Readonly<Record<string, JsonValue>>,
): LayoutRow | null {
  const session = store.get().session;
  if (session === null) return null;
  const clientScoped = layoutScopeOf(page) === 'client';
  return {
    client_id: clientScoped ? session.client.id : null,
    profile_id: clientScoped ? null : session.client.profile_id,
    page,
    layout: { ...layout },
    updated_at: new Date().toISOString(),
  };
}

function enqueue(store: EntityStore, key: string, run: () => Promise<void>): void {
  const lanes = tails.get(store) ?? new Map<string, Promise<void>>();
  tails.set(store, lanes);
  const work = (lanes.get(key) ?? Promise.resolve()).then(run);
  lanes.set(key, work);
  void work.finally(() => {
    if (lanes.get(key) === work) lanes.delete(key);
  });
}

export function saveStoredLayout(
  store: EntityStore,
  page: string,
  layout: Readonly<Record<string, JsonValue>>,
  failure: string,
): void {
  const client = api();
  const scope = layoutWriteScope(store.get());
  const record = layoutRow(store, page, layout);
  if (scope === null || record === null) return;
  const request = Symbol(page);
  const sequenced = serverSupportsLayoutWrites(client.baseUrl);
  if (sequenced) store.update((state) => beginLayoutWrite(state, record, request, scope));
  enqueue(store, JSON.stringify([client.baseUrl, scope, page]), async () => {
    if (!retainLayoutWrite(store, scope, client, { page, request })) return;
    try {
      const received: { sequence: number | null } = { sequence: null };
      const saved = await client.call(
        E.saveLayout,
        { params: { page }, body: { layout: { ...layout } } },
        {
          onSequence: (seq) => {
            received.sequence = seq;
          },
        },
      );
      const sequence = received.sequence;
      if (sequenced && sequence === null) throw new LayoutSequenceError(page);
      if (!retainLayoutWrite(store, scope, client, { page, request })) return;
      if (sequence !== null)
        store.update((state) =>
          acknowledgeLayoutWrite(state, page, request, { scope, record: saved, seq: sequence }),
        );
      log.info('layout.saved', { page });
    } catch (error) {
      if (!retainLayoutWrite(store, scope, client, { page, request })) return;
      store.update((state) => refuseLayoutWrite(state, page, request, scope));
      notify({ message: failure, error, tone: 'critical' });
    }
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
