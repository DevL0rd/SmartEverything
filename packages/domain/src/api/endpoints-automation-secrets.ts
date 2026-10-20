import { z } from 'zod';
import { AUTOMATION_SECRET_ENTRY, AUTOMATION_SECRET_INPUT } from '../automation-secrets';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

export const AUTOMATION_SECRET_ENDPOINTS = {
  listAutomationSecrets: endpoint({
    method: 'GET',
    path: '/api/automation-secrets',
    access: 'owner',
    summary: 'Names and dates of the secrets automations can use; values are never returned',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(AUTOMATION_SECRET_ENTRY),
  }),
  setAutomationSecret: endpoint({
    method: 'POST',
    path: '/api/automation-secrets',
    access: 'owner',
    summary:
      'Create a secret, or replace the value of the secret with the same name; the value is write-only',
    params: NOTHING,
    query: NOTHING,
    body: AUTOMATION_SECRET_INPUT,
    response: AUTOMATION_SECRET_ENTRY,
  }),
  removeAutomationSecret: endpoint({
    method: 'DELETE',
    path: '/api/automation-secrets/:secretId',
    access: 'owner',
    summary:
      'Remove a secret; refused while a published automation uses it, and the error lists those automations',
    params: z.strictObject({ secretId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
