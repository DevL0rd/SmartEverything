import type { GoogleAccountRow, PlannerCollectionRow } from '@smarteverything/domain';
import { compareText } from '../../../format/text';

export interface CalendarChoice {
  readonly googleId: string;
  readonly name: string;
  readonly on: boolean;
}

export interface SyncedList {
  readonly googleId: string;
  readonly name: string;
}

function googleRows(
  account: GoogleAccountRow,
  collections: readonly PlannerCollectionRow[],
  kind: PlannerCollectionRow['kind'],
): SyncedList[] {
  return collections
    .flatMap((row): SyncedList[] =>
      row.kind === kind && row.google !== null && row.profile_id === account.profile_id
        ? [{ googleId: row.google.id, name: row.name }]
        : [],
    )
    .sort((left, right) => compareText(left.name, right.name));
}

export function calendarChoices(
  account: GoogleAccountRow,
  collections: readonly PlannerCollectionRow[],
): CalendarChoice[] {
  const chosen = new Set(account.calendar_ids);
  const mirrored = googleRows(account, collections, 'calendar');
  const known = new Set(mirrored.map((row) => row.googleId));
  const waiting = account.calendar_ids
    .filter((id) => !known.has(id))
    .map((id): CalendarChoice => ({ googleId: id, name: id, on: true }));
  return [...mirrored.map((row) => ({ ...row, on: chosen.has(row.googleId) })), ...waiting];
}

export function syncedLists(
  account: GoogleAccountRow,
  collections: readonly PlannerCollectionRow[],
): SyncedList[] {
  return googleRows(account, collections, 'list');
}

export function calendarIdsWith(
  account: GoogleAccountRow,
  googleId: string,
  on: boolean,
): string[] {
  const others = account.calendar_ids.filter((id) => id !== googleId);
  return on ? [...others, googleId] : others;
}
