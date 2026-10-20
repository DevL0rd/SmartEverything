import {
  API_ENDPOINTS as E,
  type AccessAuditRow,
  type AccessRequestDecision,
  type AccessRequestRow,
  type AccessRequestStatus,
  type NewAccessRequest,
  type PersonAccess,
  type PersonAccessChange,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.access');

export async function listPersonAccess(): Promise<PersonAccess[]> {
  return api().call(E.listPersonAccess, {});
}

export async function changePersonAccess(
  profileId: string,
  change: PersonAccessChange,
): Promise<PersonAccess> {
  const access = await api().call(E.changePersonAccess, { params: { profileId }, body: change });
  log.info('person_access.changed', { profileId, fields: Object.keys(change) });
  return access;
}

export async function revokePerson(profileId: string): Promise<void> {
  await api().call(E.revokePerson, { params: { profileId } });
  log.info('person_access.revoked', { profileId });
}

export async function listAccessAudit(
  limit: number,
  profileId: string | null,
): Promise<AccessAuditRow[]> {
  return api().call(E.listAccessAudit, {
    query: { limit, ...(profileId === null ? {} : { profileId }) },
  });
}

export async function listAccessRequests(
  status: AccessRequestStatus | null,
): Promise<AccessRequestRow[]> {
  return api().call(E.listAccessRequests, {
    query: status === null ? {} : { status },
  });
}

export async function createAccessRequest(request: NewAccessRequest): Promise<AccessRequestRow> {
  const row = await api().call(E.createAccessRequest, { body: request });
  log.info('access_request.created', { kind: request.kind });
  return row;
}

export async function decideAccessRequest(
  requestId: string,
  decision: AccessRequestDecision,
): Promise<AccessRequestRow> {
  const row = await api().call(E.decideAccessRequest, {
    params: { requestId },
    body: decision,
  });
  log.info('access_request.decided', { requestId, approve: decision.approve });
  return row;
}
