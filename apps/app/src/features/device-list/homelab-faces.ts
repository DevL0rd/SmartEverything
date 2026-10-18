import {
  pluginStreamKey,
  SESSION,
  type AdGuardSnapshot,
  type RouterSnapshot,
  type SyncthingSnapshot,
} from '@smarteverything/domain';
import { z } from 'zod';
import { makeTable, type StoreState } from '../../store/state';
import type { Face } from './cell-budget';

const OWNER = SESSION.parse({
  client: {
    id: '00000000-0000-4000-8000-0000000000aa',
    name: 'Phone',
    platform: 'android',
    role: 'owner',
    built_in: false,
    profile_id: null,
    created_at: '2026-10-01T00:00:00.000Z',
    last_seen_at: null,
  },
  hub: { version: '1.0.0', startedAt: '2026-10-01T00:00:00.000Z', cameras: 'running' },
});

function seeding(
  plugin: string,
  stream: string,
  value: unknown,
  owner: boolean,
): (state: StoreState) => StoreState {
  const key = pluginStreamKey(plugin, stream);
  const row = {
    plugin_id: plugin,
    stream,
    value: JSON_ROUNDTRIP.parse(JSON.parse(JSON.stringify(value))),
    at: '2026-10-16T08:00:00.000Z',
  };
  return (state) => ({
    ...state,
    ...(owner ? { session: OWNER } : {}),
    tables: { ...state.tables, plugin_streams: makeTable({ [key]: row }, [key], 1) },
  });
}

const JSON_ROUNDTRIP = z.json();

const FIRMWARE = ['firmware', { kind: 'text', maxLength: 64 }] as const;

function face(name: string, kind: Face['kind'], seed: (state: StoreState) => StoreState): Face {
  return {
    name,
    kind,
    specs: [FIRMWARE],
    values: { firmware: '1.0.0' },
    shown: ['firmware', '1.0.1'],
    seed,
  };
}

export function routerFace(snapshot: RouterSnapshot, owner = false): Face {
  return face('router', 'router', seeding('router', 'router.snapshot', snapshot, owner));
}

export function adguardFace(snapshot: AdGuardSnapshot, owner = false): Face {
  return face(
    'adguard home',
    'dns_filter',
    seeding('adguard', 'adguard.snapshot', snapshot, owner),
  );
}

export function syncthingFace(snapshot: SyncthingSnapshot, owner = false): Face {
  return face(
    'syncthing',
    'file_sync',
    seeding('syncthing', 'syncthing.snapshot', snapshot, owner),
  );
}
