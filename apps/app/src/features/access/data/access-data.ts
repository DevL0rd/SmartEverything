import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  AccessAuditRow,
  AccessRequestDecision,
  AccessRequestRow,
  NewAccessRequest,
  PersonAccess,
  PersonAccessChange,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import {
  changePersonAccess,
  createAccessRequest,
  decideAccessRequest,
  listAccessAudit,
  listAccessRequests,
  listPersonAccess,
  revokePerson,
} from '../../../api/person-access';
import { ACCESS_PREFIX } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useIsOwner } from '../../../store/selectors';

const PEOPLE_KEY = [...ACCESS_PREFIX, 'people'] as const;

function auditKey(
  limit: number,
  profileId: string | null,
): readonly ['window', 'access', 'audit', number, string | null] {
  return [...ACCESS_PREFIX, 'audit', limit, profileId];
}

export function peopleAccessQuery(owner: boolean): {
  readonly queryKey: typeof PEOPLE_KEY;
  readonly queryFn: typeof listPersonAccess;
  readonly enabled: boolean;
} {
  return { queryKey: PEOPLE_KEY, queryFn: listPersonAccess, enabled: owner };
}

export function accessAuditQuery(
  owner: boolean,
  limit: number,
  profileId: string | null,
): {
  readonly queryKey: ReturnType<typeof auditKey>;
  readonly queryFn: () => Promise<AccessAuditRow[]>;
  readonly enabled: boolean;
} {
  return {
    queryKey: auditKey(limit, profileId),
    queryFn: () => listAccessAudit(limit, profileId),
    enabled: owner,
  };
}

export function usePeopleAccess(): UseQueryResult<PersonAccess[]> {
  return useScreenQuery(peopleAccessQuery(useIsOwner()));
}

export function usePersonAccess(profileId: string): UseQueryResult<PersonAccess | null> {
  return useScreenQuery({
    ...peopleAccessQuery(useIsOwner()),
    select: (people) => people.find((person) => person.profile_id === profileId) ?? null,
  });
}

export function useAccessAudit(
  limit: number,
  profileId: string | null,
): UseQueryResult<AccessAuditRow[]> {
  return useScreenQuery(accessAuditQuery(useIsOwner(), limit, profileId));
}

const REQUESTS_KEY = [...ACCESS_PREFIX, 'requests'] as const;

export function useAccessRequests(): UseQueryResult<AccessRequestRow[]> {
  return useScreenQuery({
    queryKey: REQUESTS_KEY,
    queryFn: () => listAccessRequests(null),
  });
}

export interface RequestActions {
  readonly ask: (request: NewAccessRequest) => Promise<void>;
  readonly decide: (requestId: string, decision: AccessRequestDecision) => Promise<void>;
}

export function useRequestActions(): RequestActions {
  const client = useQueryClient();
  const refresh = (): void => {
    background(client.invalidateQueries({ queryKey: ACCESS_PREFIX }), 'queries.invalidate_failed');
  };
  return {
    ask: async (request): Promise<void> => {
      await createAccessRequest(request);
      refresh();
    },
    decide: async (requestId, decision): Promise<void> => {
      await decideAccessRequest(requestId, decision);
      refresh();
    },
  };
}

export interface AccessActions {
  readonly change: (profileId: string, change: PersonAccessChange) => Promise<void>;
  readonly revoke: (profileId: string) => Promise<void>;
}

export function useAccessActions(): AccessActions {
  const client = useQueryClient();
  const refresh = (): void => {
    background(client.invalidateQueries({ queryKey: ACCESS_PREFIX }), 'queries.invalidate_failed');
  };
  return {
    change: async (profileId, change): Promise<void> => {
      await changePersonAccess(profileId, change);
      refresh();
    },
    revoke: async (profileId): Promise<void> => {
      await revokePerson(profileId);
      refresh();
    },
  };
}
