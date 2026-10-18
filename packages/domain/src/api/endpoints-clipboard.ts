import { z } from 'zod';
import { CLIPBOARD_CLIP } from '../shared-clipboard';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const CLIPBOARD_ENDPOINTS = {
  readSharedClipboard: endpoint({
    method: 'GET',
    path: '/api/clipboard',
    access: 'member',
    summary:
      'The text last copied on any of the person’s devices, shared between them (null when nothing was copied since the server started)',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: CLIPBOARD_CLIP.nullable(),
  }),
  writeSharedClipboard: endpoint({
    method: 'PUT',
    path: '/api/clipboard',
    access: 'member',
    summary:
      'Copy text to the person’s shared clipboard; their other devices put it on their own clipboard',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ text: z.string().min(1) }),
    response: CLIPBOARD_CLIP,
  }),
} as const;
