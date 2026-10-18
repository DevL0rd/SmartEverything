import {
  API_ENDPOINTS as E,
  type AccessAuditRow,
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
