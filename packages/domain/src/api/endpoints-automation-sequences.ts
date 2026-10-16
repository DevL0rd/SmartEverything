import { z } from 'zod';
import { AUTOMATION_SEQUENCE_DEFINITION, AUTOMATION_SEQUENCE_ROW } from '../automation-sequences';
import { AUTOMATION_RUN_ROW } from '../automation-runs';
import { JSON_VALUE } from '../values';
import { endpoint, NO_BODY } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

const PARAMS = z.strictObject({ sequenceId: ID });
const REVISION = z.string().regex(/^[a-f0-9]{64}$/);
const WRITE = {
  name: z.string().trim().min(1).max(80),
  definition: AUTOMATION_SEQUENCE_DEFINITION,
};
export const AUTOMATION_SEQUENCE_ENDPOINTS = {
  listAutomationSequences: endpoint({
    method: 'GET',
    path: '/api/sequences',
    access: 'member',
    summary: 'Read named reusable sequences with typed parameters and guarded revisions',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(AUTOMATION_SEQUENCE_ROW),
  }),
  readAutomationSequence: endpoint({
    method: 'GET',
    path: '/api/sequences/:sequenceId',
    access: 'member',
    summary: 'Read one reusable sequence and its current revision before editing',
    params: PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: AUTOMATION_SEQUENCE_ROW,
  }),
  createAutomationSequence: endpoint({
    method: 'POST',
    path: '/api/sequences',
    access: 'member',
    summary: 'Create a bounded reusable action sequence with typed parameters',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject(WRITE),
    response: AUTOMATION_SEQUENCE_ROW,
  }),
  updateAutomationSequence: endpoint({
    method: 'PUT',
    path: '/api/sequences/:sequenceId',
    access: 'member',
    summary: 'Replace a sequence at its expected revision after recursive validation',
    params: PARAMS,
    query: NOTHING,
    body: z.strictObject({ ...WRITE, expectedRevision: REVISION }),
    response: AUTOMATION_SEQUENCE_ROW,
  }),
  removeAutomationSequence: endpoint({
    method: 'DELETE',
    path: '/api/sequences/:sequenceId',
    access: 'member',
    summary: 'Delete an unreferenced sequence at its expected revision',
    params: PARAMS,
    query: NOTHING,
    body: z.strictObject({ expectedRevision: REVISION }),
    response: DONE,
  }),
  startAutomationSequence: endpoint({
    method: 'POST',
    path: '/api/sequences/:sequenceId/start',
    access: 'member',
    summary: 'Start a reusable sequence under its policy and return its owned run immediately',
    params: PARAMS,
    query: NOTHING,
    body: z.strictObject({ parameters: z.record(z.string(), JSON_VALUE).default({}) }),
    response: AUTOMATION_RUN_ROW,
  }),
  stopAutomationSequence: endpoint({
    method: 'POST',
    path: '/api/sequences/:sequenceId/stop',
    access: 'member',
    summary: 'Idempotently stop active and queued runs of a reusable sequence',
    params: PARAMS,
    query: NOTHING,
    body: z.strictObject({ controlKey: z.string().trim().min(1).max(100).optional() }),
    response: DONE,
  }),
} as const;
