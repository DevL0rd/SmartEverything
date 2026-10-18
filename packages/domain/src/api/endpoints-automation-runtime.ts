import { z } from 'zod';
import {
  AUTOMATION_VALUE_CONTENT,
  AUTOMATION_VALUE_OPERATION,
  AUTOMATION_VALUE_ROW,
} from '../automation-values';
import { AUTOMATION_RUN_ROW } from '../automation-runs';
import { endpoint, NO_BODY } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

const VALUE_PARAMS = z.strictObject({ valueId: ID });
const RUN_PARAMS = z.strictObject({ runId: ID });
const AUTOMATION_PARAMS = z.strictObject({ automationId: ID });
export const AUTOMATION_RUNTIME_ENDPOINTS = {
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
  listAutomationRuns: endpoint({
    method: 'GET',
    path: '/api/automations/runs',
    access: 'member',
    summary: 'Read the most recent 200 automation runs, optionally for one automation',
    params: NOTHING,
    query: z.strictObject({ automationId: ID.optional() }),
    body: NO_BODY,
    response: z.array(AUTOMATION_RUN_ROW),
  }),
  readAutomationRun: endpoint({
    method: 'GET',
    path: '/api/automations/runs/:runId',
    access: 'member',
    summary: 'Read a run’s status and bounded step trace with command history IDs',
    params: RUN_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: AUTOMATION_RUN_ROW,
  }),
  stopAutomationRun: endpoint({
    method: 'POST',
    path: '/api/automations/runs/:runId/stop',
    access: 'member',
    summary:
      'Idempotently cancel an owned run’s future actions; already sent physical commands may complete',
    params: RUN_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: AUTOMATION_RUN_ROW,
  }),
  stopAutomationRuns: endpoint({
    method: 'POST',
    path: '/api/automations/:automationId/runs/stop',
    access: 'member',
    summary:
      'Stop active and queued runs of an automation, optionally restricted to its configured key',
    params: AUTOMATION_PARAMS,
    query: NOTHING,
    body: z.strictObject({ key: z.string().trim().min(1).max(100).optional() }),
    response: DONE,
  }),
} as const;
