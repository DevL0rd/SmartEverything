import { z } from 'zod';
import {
  AUTOMATION_VALUE_CONTENT,
  AUTOMATION_VALUE_OPERATION,
  AUTOMATION_VALUE_ROW,
} from '../automation-values';
import { AUTOMATION_RUN_ROW } from '../automation-runs';
import { AUTOMATION_ROW } from './rows-media';
import { endpoint, NO_BODY } from './endpoint';
import { DONE, ID, NOTHING, QUERY_FLAG } from './primitives';

const VALUE_PARAMS = z.strictObject({ valueId: ID });
const RUN_PARAMS = z.strictObject({ runId: ID });
const AUTOMATION_PARAMS = z.strictObject({ automationId: ID });
export const AUTOMATION_RUNTIME_ENDPOINTS = {
  readAutomationRevision: endpoint({
    method: 'GET',
    path: '/api/automations/:automationId/revision',
    access: 'member',
    summary:
      'Read an automation and its coherent current definition revision for an explicit guarded save',
    params: AUTOMATION_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: z.strictObject({
      automation: AUTOMATION_ROW,
      definitionRevision: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  }),
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
      'Replace a Value definition and current value at its expected revision; removing a selected choice requires an explicit replacement',
    params: VALUE_PARAMS,
    query: NOTHING,
    body: z.strictObject({
      content: AUTOMATION_VALUE_CONTENT,
      expectedRevision: z.int().positive(),
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
    summary: 'Read the most recent 200 owned automation runs, optionally for one automation',
    params: NOTHING,
    query: z.strictObject({
      automationId: ID.optional(),
      targetType: z.enum(['automation', 'sequence']).optional(),
      runDetails: QUERY_FLAG.default(false),
    }),
    body: NO_BODY,
    response: z.array(AUTOMATION_RUN_ROW),
  }),
  readAutomationRun: endpoint({
    method: 'GET',
    path: '/api/automations/runs/:runId',
    access: 'member',
    summary: 'Read a run’s status and bounded step trace with command history IDs',
    params: RUN_PARAMS,
    query: z.strictObject({ runDetails: QUERY_FLAG.default(false) }),
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
    query: z.strictObject({ runDetails: QUERY_FLAG.default(false) }),
    body: NO_BODY,
    response: AUTOMATION_RUN_ROW,
  }),
  stopAutomationRuns: endpoint({
    method: 'POST',
    path: '/api/automations/:automationId/runs/stop',
    access: 'member',
    summary:
      'Stop active and queued runs of an automation, optionally restricted to its configured control key',
    params: AUTOMATION_PARAMS,
    query: NOTHING,
    body: z.strictObject({ controlKey: z.string().trim().min(1).max(100).optional() }),
    response: DONE,
  }),
  startAutomation: endpoint({
    method: 'POST',
    path: '/api/automations/:automationId/start',
    access: 'member',
    summary:
      'Start a saved automation under its run policy, skipping entry triggers and conditions, and return its owned run immediately',
    params: AUTOMATION_PARAMS,
    query: z.strictObject({ runDetails: QUERY_FLAG.default(false) }),
    body: NO_BODY,
    response: AUTOMATION_RUN_ROW,
  }),
} as const;
