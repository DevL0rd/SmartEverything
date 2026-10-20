import { z } from 'zod';
import {
  AUTOMATION_VALUE_CONTENT,
  AUTOMATION_VALUE_OPERATION,
  AUTOMATION_VALUE_ROW,
} from '../automation-values';
import { endpoint, NO_BODY } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

const VALUE_PARAMS = z.strictObject({ valueId: ID });
export const AUTOMATION_VALUE_ENDPOINTS = {
  listAutomationValues: endpoint({
    method: 'GET',
    path: '/api/automations/values',
    access: 'member',
    summary: 'Read the home’s typed automation Values',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(AUTOMATION_VALUE_ROW),
  }),
  createAutomationValue: endpoint({
    method: 'POST',
    path: '/api/automations/values',
    access: 'member',
    summary: 'Create a typed automation Value with validated bounds and stable choice identities',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ content: AUTOMATION_VALUE_CONTENT }),
    response: AUTOMATION_VALUE_ROW,
  }),
  updateAutomationValue: endpoint({
    method: 'PUT',
    path: '/api/automations/values/:valueId',
    access: 'member',
    summary:
      'Replace a Value definition and current value; expectedRevision is optional and refuses the save when the Value changed since it was read. Removing a selected choice requires an explicit replacement',
    params: VALUE_PARAMS,
    query: NOTHING,
    body: z.strictObject({
      content: AUTOMATION_VALUE_CONTENT,
      expectedRevision: z.int().positive().optional(),
    }),
    response: AUTOMATION_VALUE_ROW,
  }),
  applyAutomationValueOperation: endpoint({
    method: 'POST',
    path: '/api/automations/values/:valueId/operations',
    access: 'member',
    summary: 'Atomically set, toggle, increment, decrement or cycle an automation Value',
    params: VALUE_PARAMS,
    query: NOTHING,
    body: AUTOMATION_VALUE_OPERATION,
    response: AUTOMATION_VALUE_ROW,
  }),
  removeAutomationValue: endpoint({
    method: 'DELETE',
    path: '/api/automations/values/:valueId',
    access: 'member',
    summary: 'Delete an unreferenced automation Value',
    params: VALUE_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
