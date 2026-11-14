import type {
  GoogleAccountRow,
  GoogleSyncLogEntry,
  PlannerCollectionRow,
} from '@smarteverything/domain';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { readGoogleSyncLog } from '../../../api/google';
import type { AppHref } from '../../../components/app-href';
import { WINDOW_PREFIX } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useIsOwner, useRows, useSession } from '../../../store/selectors';
import type { GooglePerson } from './google-status';

const LOG_PREFIX = [...WINDOW_PREFIX, 'google-sync-log'] as const;

export interface GoogleSubject {
  readonly person: GooglePerson;
  readonly isMe: boolean;
  readonly owner: boolean;
}

export function googleHref(personId: string, me: string | null): AppHref {
  const page = ['connections', 'google'];
  return personId === me
    ? { pathname: '/settings/[...page]', params: { page } }
    : { pathname: '/settings/[...page]', params: { page, person: personId } };
}

export function useGooglePeople(): readonly GooglePerson[] {
  return useRows('profiles');
}

export function useGoogleAccounts(): readonly GoogleAccountRow[] {
  return useRows('google_accounts');
}

export function useGoogleCollections(): readonly PlannerCollectionRow[] {
  return useRows('planner_collections');
}

export function useGoogleAccountOf(personId: string): GoogleAccountRow | null {
  return useGoogleAccounts().find((row) => row.profile_id === personId) ?? null;
}

export function useGoogleSubject(): GoogleSubject | null {
  const { person } = useLocalSearchParams<{ person?: string }>();
  const me = useSession().client.profile_id;
  const owner = useIsOwner();
  const people = useGooglePeople();
  const wanted = person ?? me;
  if (wanted !== me && !owner) return null;
  const found = people.find((row) => row.id === wanted);
  return found === undefined ? null : { person: found, isMe: found.id === me, owner };
}

export function useGoogleSyncLog(
  account: GoogleAccountRow,
): UseQueryResult<readonly GoogleSyncLogEntry[]> {
  return useScreenQuery({
    queryKey: [...LOG_PREFIX, account.profile_id, account.last_sync_at],
    queryFn: () => readGoogleSyncLog(account.profile_id, undefined),
  });
}

export function useRefreshSyncLog(personId: string): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: [...LOG_PREFIX, personId] });
}
