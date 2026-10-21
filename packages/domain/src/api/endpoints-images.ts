import { z } from 'zod';
import {
  IMAGE_PROVIDER_CATALOG,
  IMAGE_OPERATION_RECEIPT,
  IMAGE_GENERATE_INPUT,
  IMAGE_EDIT_INPUT,
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
  generateImageOperation: endpoint({
    method: 'POST',
    path: '/api/assistant/images/operations',
    access: 'member',
    summary:
      'Generate a new image with a metered request, with no input image or with images only as style, composition or mood references, and wait for the outcome: the receipt returns once the request is completed, failed, cancelled or unknown, with the saved attachment ids',
    params: NOTHING,
    query: NOTHING,
    body: IMAGE_GENERATE_INPUT,
    response: IMAGE_OPERATION_RECEIPT,
  }),
  editImageOperation: endpoint({
    method: 'POST',
    path: '/api/assistant/images/edits',
    access: 'member',
    summary:
      'Edit an existing image with a metered request, preserving what the prompt does not change, and wait for the outcome: the receipt returns once the request is completed, failed, cancelled or unknown, with the saved attachment ids',
    params: NOTHING,
    query: NOTHING,
    body: IMAGE_EDIT_INPUT,
    response: IMAGE_OPERATION_RECEIPT,
  }),
  listImageOperations: endpoint({
    method: 'GET',
    path: '/api/assistant/images/operations',
    access: 'member',
    summary: 'Image receipt history for the person in the app',
    params: NOTHING,
    query: z.strictObject({ chat_id: ID }),
    body: NO_BODY,
    response: z.array(IMAGE_OPERATION_RECEIPT),
  }),
  readImageOperation: endpoint({
    method: 'GET',
    path: '/api/assistant/images/operations/:operationId',
    access: 'member',
    summary: 'Image receipt status and lineage for the person in the app',
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
