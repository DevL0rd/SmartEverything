import { z } from 'zod';
import {
  ACCESS_AUDIT_ROW,
  ACCESS_REQUEST_DECISION,
  ACCESS_REQUEST_ROW,
  ACCESS_REQUEST_STATUS,
  NEW_ACCESS_REQUEST,
  PERSON_ACCESS,
  PERSON_ACCESS_CHANGE,
} from '../person-access';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING, queryLimit } from './primitives';

const PERSON_PARAMS = z.strictObject({ profileId: ID });

const REQUEST_PARAMS = z.strictObject({ requestId: ID });

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
  createAccessRequest: endpoint({
    method: 'POST',
    path: '/api/access/requests',
    access: 'member',
    summary:
      'Ask the owner for more: an area, a device or room, an AI model or more AI budget that the limits of this person refuse; the owner is told at once',
    params: NOTHING,
    query: NOTHING,
    body: NEW_ACCESS_REQUEST,
    response: ACCESS_REQUEST_ROW,
  }),
  listAccessRequests: endpoint({
    method: 'GET',
    path: '/api/access/requests',
    access: 'member',
    summary:
      'Requests for more access, newest first: the owner sees every person’s, anyone else only their own',
    params: NOTHING,
    query: z.strictObject({ status: ACCESS_REQUEST_STATUS.optional() }),
    body: NO_BODY,
    response: z.array(ACCESS_REQUEST_ROW),
  }),
  decideAccessRequest: endpoint({
    method: 'POST',
    path: '/api/access/requests/:requestId/decision',
    access: 'owner',
    summary:
      'Approve a request for more access, for ever or until a time, or deny it; an approval widens that person’s limits at once and takes the grant back at the end time; name the target when the request has none',
    params: REQUEST_PARAMS,
    query: NOTHING,
    body: ACCESS_REQUEST_DECISION,
    response: ACCESS_REQUEST_ROW,
  }),
} as const;
