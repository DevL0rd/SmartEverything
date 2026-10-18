import { z } from 'zod';
import { ACCESS_AUDIT_ROW, PERSON_ACCESS, PERSON_ACCESS_CHANGE } from '../person-access';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING, queryLimit } from './primitives';

const PERSON_PARAMS = z.strictObject({ profileId: ID });

const AUDIT_LIMIT = 200;

export const PERSON_ACCESS_ENDPOINTS = {
  listPersonAccess: endpoint({
    method: 'GET',
    path: '/api/access/people',
    access: 'owner',
    summary: 'The role, limits, conditions and end time of every person',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(PERSON_ACCESS),
  }),
  changePersonAccess: endpoint({
    method: 'PATCH',
    path: '/api/access/people/:profileId',
    access: 'owner',
    summary:
      'Change what a person may do: role, template, areas, devices, models, channels, AI budget, conditions or end time; the limits apply at once to a person who is not an owner',
    params: PERSON_PARAMS,
    query: NOTHING,
    body: PERSON_ACCESS_CHANGE,
    response: PERSON_ACCESS,
  }),
  revokePerson: endpoint({
    method: 'POST',
    path: '/api/access/people/:profileId/revoke',
    access: 'owner',
    summary:
      'End the access of a person now: unpair every member device and stop their chat accounts; the person and their data stay',
    params: PERSON_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  listAccessAudit: endpoint({
    method: 'GET',
    path: '/api/access/audit',
    access: 'owner',
    summary: 'Refused requests and owner changes to access, newest first',
    params: NOTHING,
    query: z.strictObject({ limit: queryLimit(50, AUDIT_LIMIT), profileId: ID.optional() }),
    body: NO_BODY,
    response: z.array(ACCESS_AUDIT_ROW),
  }),
} as const;
