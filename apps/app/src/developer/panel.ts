import { CLIENT_PREFS, type DeveloperLevel, type LayoutRow } from '@smarteverything/domain';
import { savePref } from '../store/prefs';
import type { EntityStore } from '../store/entity-store';
import type { StoreState } from '../store/state';

const LEVEL = CLIENT_PREFS.developer_level;

function sameLevel(row: LayoutRow | null, layer: 'device' | 'person'): boolean {
  if (row === null) {
    return false;
  }
  const clientScoped = row.client_id !== null;
  return layer === 'device' ? clientScoped : !clientScoped && row.profile_id !== null;
}

export function deviceRow(state: StoreState): LayoutRow | null {
  const row = state.tables.layouts.byId[LEVEL.storageKey];
  return row === undefined || !sameLevel(row, 'device') ? null : row;
}

export function personRow(state: StoreState): LayoutRow | null {
  const personId = state.session?.client.profile_id ?? null;
  const row = Object.values(state.tables.layouts.byId).find(
    (candidate) =>
      candidate.page === LEVEL.storageKey &&
      personId !== null &&
      candidate.profile_id === personId &&
      sameLevel(candidate, 'person'),
  );
  return row ?? null;
}

function levelOf(row: LayoutRow | null): DeveloperLevel {
  const read = row === null ? null : LEVEL.decode(row.layout);
  return read === null || read.status === 'invalid' ? 'off' : read.value;
}

export function deviceLevel(state: StoreState): DeveloperLevel {
  return levelOf(deviceRow(state));
}

export function personLevel(state: StoreState): DeveloperLevel {
  return levelOf(personRow(state));
}

export function levelsUnlocked(device: DeveloperLevel, person: DeveloperLevel): boolean {
  return device === 'on' || person === 'on';
}

export function unlockedIn(state: StoreState): boolean {
  return (
    state.session?.client.role === 'owner' && levelsUnlocked(deviceLevel(state), personLevel(state))
  );
}

export function setDeveloperLevel(store: EntityStore, level: DeveloperLevel): void {
  savePref(store, LEVEL, level);
}
