import { z } from 'zod';
import {
  AI_REPAIR_ADMISSION,
  AI_REPAIR_CURSOR,
  AI_REPAIR_DISMISSAL,
  AI_REPAIR_FINGERPRINT,
  AI_REPAIR_PAGE,
  AI_REPAIR_PATCH_REQUEST,
  AI_REPAIR_SETTINGS,
} from '../ai-repair';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const AI_REPAIR_ENDPOINTS = {
  readAiRepairSettings: endpoint({
    method: 'GET',
    path: '/api/settings/ai-repair',
    access: 'owner',
    summary: 'Read whether automatic AI repair is enabled',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: AI_REPAIR_SETTINGS,
  }),
  updateAiRepairSettings: endpoint({
    method: 'PUT',
    path: '/api/settings/ai-repair',
    access: 'owner',
    summary: 'Let the owner enable or pause automatic AI repair without changing logging',
    params: NOTHING,
    query: NOTHING,
    body: AI_REPAIR_SETTINGS,
    response: AI_REPAIR_SETTINGS,
  }),
  listAiRepairGroups: endpoint({
    method: 'GET',
    path: '/api/ai-repair/groups',
    access: 'owner',
    summary: 'List groups of observed errors and their latest retained evidence',
    params: NOTHING,
    query: AI_REPAIR_CURSOR.partial()
      .extend({ limit: z.coerce.number().int().positive().default(100) })
      .refine(({ lastAt, fingerprint }) => (lastAt === undefined) === (fingerprint === undefined), {
        message: 'Supply both fields from the previous page cursor.',
      }),
    body: NO_BODY,
    response: AI_REPAIR_PAGE,
  }),
  dismissAiRepairGroups: endpoint({
    method: 'POST',
    path: '/api/ai-repair/groups/dismiss',
    access: 'owner',
    summary:
      'Dismiss one observed error group or clear all inactive groups from the inbox, keeping the diagnostic logs and chats',
    params: NOTHING,
    query: NOTHING,
    body: AI_REPAIR_DISMISSAL,
    response: z.strictObject({ dismissed: z.int().nonnegative() }),
  }),
  diagnoseAiRepairGroup: endpoint({
    method: 'POST',
    path: '/api/ai-repair/groups/:fingerprint/diagnose',
    access: 'owner',
    summary: 'Ask the selected chat AI to investigate and repair a retained error',
    params: z.strictObject({ fingerprint: AI_REPAIR_FINGERPRINT }),
    query: NOTHING,
    body: z.strictObject({ requestId: z.uuid() }),
    response: AI_REPAIR_ADMISSION,
  }),
  proposeAiRepairPatch: endpoint({
    method: 'POST',
    path: '/api/ai-repair/groups/:fingerprint/propose-patch',
    access: 'owner',
    summary: 'Ask the selected chat AI for a proposal using exact approved source files',
    params: z.strictObject({ fingerprint: AI_REPAIR_FINGERPRINT }),
    query: NOTHING,
    body: AI_REPAIR_PATCH_REQUEST,
    response: AI_REPAIR_ADMISSION,
  }),
};
