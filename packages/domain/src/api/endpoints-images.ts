import { z } from 'zod';
import {
  IMAGE_PROVIDER_CATALOG,
  IMAGE_OPERATION_RECEIPT,
  IMAGE_OPERATION_REQUEST,
  IMAGE_SELECTOR,
  IMAGE_RESOLVED_SELECTION,
  IMAGE_WAIT_REQUEST,
  IMAGE_WAIT_RESULT,
} from '../image-operations';
import { endpoint, NO_BODY } from './endpoint';
import { NOTHING, ID, QUERY_FLAG } from './primitives';

export const IMAGE_AREA_ENDPOINTS = {
  listImageEndpoints: endpoint({
    method: 'GET',
    path: '/api/assistant/images/endpoints',
    access: 'member',
    summary: 'Exact available OpenRouter image endpoints and metered prices',
    params: NOTHING,
    query: z.strictObject({ chat_id: ID.optional(), refresh: QUERY_FLAG.optional() }),
    body: NO_BODY,
    response: IMAGE_PROVIDER_CATALOG,
  }),
  resolveImageInput: endpoint({
    method: 'POST',
    path: '/api/assistant/images/resolve',
    access: 'member',
    summary: 'Resolve an owned chat image to a frozen attachment identity',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ chat_id: ID, selector: IMAGE_SELECTOR }),
    response: IMAGE_RESOLVED_SELECTION,
  }),
  startImageOperation: endpoint({
    method: 'POST',
    path: '/api/assistant/images/operations',
    access: 'member',
    summary:
      'Start a metered image request and return immediately; the UI shows the result automatically. Only wait_for_images when further user-requested work needs saved images; never poll or repeat the request',
    params: NOTHING,
    query: NOTHING,
    body: IMAGE_OPERATION_REQUEST,
    response: IMAGE_OPERATION_RECEIPT,
  }),
  waitForImages: endpoint({
    method: 'POST',
    path: '/api/assistant/images/wait',
    access: 'member',
    summary:
      'Wait once for the initiating chat’s current image batch when further requested work needs saved results; never wait merely to display images or monitor progress',
    params: NOTHING,
    query: NOTHING,
    body: IMAGE_WAIT_REQUEST,
    response: IMAGE_WAIT_RESULT,
  }),
  listImageOperations: endpoint({
    method: 'GET',
    path: '/api/assistant/images/operations',
    access: 'member',
    summary:
      'Image receipt history for the person in the app; UI-only, because the UI owns completion and AI must not check or poll it',
    params: NOTHING,
    query: z.strictObject({ chat_id: ID }),
    body: NO_BODY,
    response: z.array(IMAGE_OPERATION_RECEIPT),
  }),
  readImageOperation: endpoint({
    method: 'GET',
    path: '/api/assistant/images/operations/:operationId',
    access: 'member',
    summary:
      'Image receipt status and lineage for the person in the app; UI-only, because the UI owns completion and AI must not check or poll it',
    params: z.strictObject({ operationId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: IMAGE_OPERATION_RECEIPT,
  }),
  cancelImageOperation: endpoint({
    method: 'POST',
    path: '/api/assistant/images/operations/:operationId/cancel',
    access: 'member',
    summary: 'Cancel the active image-provider request; retained usage may remain unknown',
    params: z.strictObject({ operationId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: IMAGE_OPERATION_RECEIPT,
  }),
} as const;
