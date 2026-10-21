import { AI_MESSAGE_REFERENCES, referencesMatchText } from '../ai-references';
import { z } from 'zod';
import {
  ASSISTANT_ATTACHMENT,
  ASSISTANT_ATTACHMENT_BYTES_MAX,
  ASSISTANT_MESSAGE_ROW,
  ASSISTANT_SETTINGS_CHANGE,
  ASSISTANT_STATUS,
  ASSISTANT_UPLOAD_CHUNK_BYTES,
} from '../assistant';
import { ASSISTANT_RESPONSE_STYLE } from '../assistant-response-style';
import { NO_BODY, endpoint } from './endpoint';
import { MEDIA_LINK } from './endpoints-media';
import { DONE, ID, MOMENT, NOTHING, queryLimit } from './primitives';

const ATTACHMENT_IDS = z.array(ID).default([]);

export const ASSISTANT_NEW_MESSAGE = z
  .strictObject({
    text: z.string().trim().default(''),
    attachments: ATTACHMENT_IDS,
    references: AI_MESSAGE_REFERENCES.optional(),
    client_message_id: ID.optional().describe(
      'An id the sender makes up for this message; sending the same id again returns the first message instead of adding another',
    ),
  })
  .refine((message) => message.text !== '' || message.attachments.length > 0, {
    message: 'send some text or at least one attachment',
  })
  .refine((message) => referencesMatchText(message.text, message.references ?? []), {
    message: 'Reference spans must match the submitted text.',
  });

export type AssistantNewMessage = z.output<typeof ASSISTANT_NEW_MESSAGE>;

const LOCAL_FILE = z.strictObject({
  path: z
    .string()
    .min(1)
    .max(1024)
    .describe('Absolute path of a file in the temp folder (callers on this computer only)'),
});

const UPLOADED_FILE = z.strictObject({ uploadId: ID });

export const ASSISTANT_OUT_FILE = z.union([LOCAL_FILE, UPLOADED_FILE]);

export type AssistantOutFile = z.infer<typeof ASSISTANT_OUT_FILE>;

export const ASSISTANT_POST = z.strictObject({
  text: z.string().trim().default(''),
  files: z.array(ASSISTANT_OUT_FILE).default([]),
  profileId: ID.optional().describe(
    'Whose chat: a person’s profile id from person_read (not a device or client id); the owner’s when left out',
  ),
  notify: z.boolean().default(true).describe('false to skip the phone notification'),
});

export type AssistantPost = z.output<typeof ASSISTANT_POST>;

export const ASSISTANT_UPLOAD_START = z.strictObject({
  name: z.string().trim().min(1).max(200),
  mime: z.string().trim().min(3).max(120),
  bytes: z.int().min(1).max(ASSISTANT_ATTACHMENT_BYTES_MAX),
});

export const ASSISTANT_UPLOAD = z.strictObject({
  uploadId: ID,
  chunkBytes: z.int().positive(),
  expiresAt: MOMENT,
});

export const ASSISTANT_UPLOAD_CHUNK = z.strictObject({
  index: z.int().min(0).max(1000),
  data: z
    .string()
    .min(1)
    .max(Math.ceil((ASSISTANT_UPLOAD_CHUNK_BYTES * 4) / 3) + 4),
});

export const ASSISTANT_ATTACHMENT_LINK = MEDIA_LINK.extend({ id: ID });

const MESSAGE_ENDPOINTS = {
  readAssistant: endpoint({
    method: 'GET',
    path: '/api/assistant',
    access: 'member',
    summary: 'The AI assistant’s settings',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: ASSISTANT_STATUS,
  }),
  listAssistantMessages: endpoint({
    method: 'GET',
    path: '/api/assistant/messages',
    access: 'member',
    summary: 'The caller’s assistant chat, newest first',
    params: NOTHING,
    query: z.strictObject({ before: MOMENT.optional(), limit: queryLimit(50, 200) }),
    body: NO_BODY,
    response: z.array(ASSISTANT_MESSAGE_ROW),
  }),
  sendAssistantMessage: endpoint({
    method: 'POST',
    path: '/api/assistant/messages',
    access: 'member',
    summary: 'Send a message with optional attachments to the assistant',
    params: NOTHING,
    query: NOTHING,
    body: ASSISTANT_NEW_MESSAGE,
    response: ASSISTANT_MESSAGE_ROW,
  }),
  removeAssistantMessage: endpoint({
    method: 'DELETE',
    path: '/api/assistant/messages/:messageId',
    access: 'member',
    summary: 'Delete one message of the caller’s assistant chat with its attachments',
    params: z.strictObject({ messageId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  clearAssistantMessages: endpoint({
    method: 'DELETE',
    path: '/api/assistant/messages',
    access: 'member',
    summary: 'Delete the caller’s whole assistant chat with its attachments',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;

const ATTACHMENT_ENDPOINTS = {
  startAssistantUpload: endpoint({
    method: 'POST',
    path: '/api/assistant/uploads',
    access: 'member',
    summary: 'Reserve an attachment upload; send its bytes in chunks, then finish it',
    params: NOTHING,
    query: NOTHING,
    body: ASSISTANT_UPLOAD_START,
    response: ASSISTANT_UPLOAD,
  }),
  sendAssistantUploadChunk: endpoint({
    method: 'PUT',
    path: '/api/assistant/uploads/:uploadId',
    access: 'member',
    summary: 'Send one base64 chunk of a reserved attachment upload',
    params: z.strictObject({ uploadId: ID }),
    query: NOTHING,
    body: ASSISTANT_UPLOAD_CHUNK,
    response: z.strictObject({ received: z.int().min(0) }),
  }),
  finishAssistantUpload: endpoint({
    method: 'POST',
    path: '/api/assistant/uploads/:uploadId',
    access: 'member',
    summary: 'Check a complete upload and keep it as an attachment for a message',
    params: z.strictObject({ uploadId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: ASSISTANT_ATTACHMENT,
  }),
  assistantAttachmentLinks: endpoint({
    method: 'POST',
    path: '/api/assistant/attachments/links',
    access: 'member',
    summary: 'Short-lived links to open or download attachments of the caller’s chat',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ ids: z.array(ID).min(1).max(50) }),
    response: z.array(ASSISTANT_ATTACHMENT_LINK),
  }),
} as const;

const SETTINGS_ENDPOINTS = {
  readAssistantResponseStyle: endpoint({
    method: 'GET',
    path: '/api/assistant/response-style',
    access: 'member',
    summary:
      'Read the shared assistant response style; affects SmartEverything turns and existing shared voice prompts',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: ASSISTANT_RESPONSE_STYLE,
  }),
  updateAssistantSettings: endpoint({
    method: 'PATCH',
    path: '/api/assistant/settings',
    access: 'owner',
    summary:
      'Change assistant settings: name, instructions, working steps, compaction, voice and how long conversations keep using the same chat',
    params: NOTHING,
    query: NOTHING,
    body: ASSISTANT_SETTINGS_CHANGE,
    response: ASSISTANT_STATUS,
  }),
} as const;

const POST_ENDPOINTS = {
  postAssistant: endpoint({
    method: 'POST',
    path: '/api/assistant/posts',
    access: 'owner',
    summary: 'Post a message to someone’s assistant chat at any time, with a phone notification',
    params: NOTHING,
    query: NOTHING,
    body: ASSISTANT_POST,
    response: ASSISTANT_MESSAGE_ROW,
  }),
} as const;

export const ASSISTANT_AREA_ENDPOINTS = {
  ...MESSAGE_ENDPOINTS,
  ...ATTACHMENT_ENDPOINTS,
  ...SETTINGS_ENDPOINTS,
  ...POST_ENDPOINTS,
} as const;
