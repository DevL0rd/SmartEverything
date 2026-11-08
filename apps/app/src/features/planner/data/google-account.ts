import type { GoogleAccountRow, GoogleProblem } from '@smarteverything/domain';
import { rowsOf, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';

export type GoogleStatus = GoogleAccountRow['status'];

export interface GoogleAccountView {
  readonly status: GoogleStatus;
  readonly email: string | null;
  readonly linked: boolean;
  readonly needsAttention: boolean;
  readonly problem: GoogleProblem | null;
  readonly lastSyncAt: string | null;
  readonly lastError: string | null;
  readonly calendarIds: readonly string[];
  readonly listIds: readonly string[];
}

export const UNLINKED: GoogleAccountView = {
  status: 'unlinked',
  email: null,
  linked: false,
  needsAttention: false,
  problem: null,
  lastSyncAt: null,
  lastError: null,
  calendarIds: [],
  listIds: [],
};

export function googleAccountView(row: GoogleAccountRow | null): GoogleAccountView {
  if (row === null) return UNLINKED;
  return {
    status: row.status,
    email: row.email,
    linked: row.status === 'linked',
    needsAttention: row.status === 'needs_attention',
    problem: row.problem,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    calendarIds: row.calendar_ids,
    listIds: row.list_ids,
  };
}

export function googleRowIn(state: StoreState): GoogleAccountRow | null {
  const profile = state.session?.client.profile_id ?? null;
  return rowsOf(state.tables.google_accounts).find((row) => row.profile_id === profile) ?? null;
}

function sameView(left: GoogleAccountView, right: GoogleAccountView): boolean {
  return (
    left.status === right.status &&
    left.email === right.email &&
    left.problem === right.problem &&
    left.lastSyncAt === right.lastSyncAt &&
    left.lastError === right.lastError &&
    left.calendarIds === right.calendarIds &&
    left.listIds === right.listIds
  );
}

export function useGoogleAccount(): GoogleAccountView {
  return useStoreSelector((state) => googleAccountView(googleRowIn(state)), sameView);
}
