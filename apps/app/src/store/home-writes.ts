import type { ClientRow, SettingsRow } from '@smarteverything/domain';
import {
  changeClientRole,
  removeClient,
  setClientProfile,
  updateHome,
  type HomeChange,
} from '../api/settings';
import type { EntityStore } from './entity-store';
import { applyChange } from './live-reducers';
import { rowEdit, writeOptimistically, type Edit, type RowAccess } from './optimistic';
import { sameJson } from './same-json';
import type { StoreState } from './state';

export function settingsEdit(previous: SettingsRow, next: SettingsRow): Edit {
  return {
    apply: (state): StoreState => ({ ...state, settings: next }),
    revert: (state): StoreState =>
      sameJson(state.settings, next) ? { ...state, settings: previous } : state,
  };
}

export function writeHome(store: EntityStore, change: HomeChange): Promise<void> {
  const previous = store.get().settings;
  return writeOptimistically(store, {
    event: 'home.change',
    edits: previous === null ? [] : [settingsEdit(previous, { ...previous, ...change })],
    send: () => updateHome(change),
    fields: { fields: Object.keys(change).join(',') },
  });
}

function clientAccess(id: string): RowAccess<ClientRow> {
  return {
    find: (state) => state.tables.clients.byId[id] ?? null,
    put: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'clients',
        operation: 'UPDATE',
        record: row,
        oldRecord: null,
      }),
    drop: (state, row) =>
      applyChange(state, {
        type: 'change',
        table: 'clients',
        operation: 'DELETE',
        record: null,
        oldRecord: row,
      }),
  };
}

function clientEdit(previous: ClientRow, next: ClientRow | null): Edit {
  return rowEdit(clientAccess(previous.id), previous, next);
}

export function writeClientRole(
  store: EntityStore,
  client: ClientRow,
  role: ClientRow['role'],
): Promise<void> {
  return writeOptimistically(store, {
    event: 'client.role_change',
    edits: [clientEdit(client, { ...client, role })],
    send: () => changeClientRole(client.id, role),
    fields: { clientId: client.id, from: client.role, to: role },
  });
}

export function writeClientProfile(
  store: EntityStore,
  client: ClientRow,
  profileId: string,
): Promise<void> {
  return writeOptimistically(store, {
    event: 'client.profile_change',
    edits: [clientEdit(client, { ...client, profile_id: profileId })],
    send: () => setClientProfile(client.id, profileId),
    fields: { clientId: client.id, profileId },
  });
}

export function unpairClient(store: EntityStore, client: ClientRow): Promise<void> {
  return writeOptimistically(store, {
    event: 'client.unpair',
    edits: [clientEdit(client, null)],
    send: () => removeClient(client.id),
    fields: { clientId: client.id },
  });
}
