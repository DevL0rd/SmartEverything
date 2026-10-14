import { z } from 'zod';
import { JSON_VALUE } from './values';
import { AI_HTML_PREVIEW_PUBLICATION } from './ai-preview-documents';
import { AI_FILE_PREVIEW_NATIVE_REQUEST } from './ai-preview-files';
import { DSH_WRITER_CLAIM_WRITE } from './dsh-sessions';
export const AI_PREVIEW_CAPABILITY = 'preview-v1';
export const AI_PREVIEW_LIFETIME_CAPABILITY = 'preview-lifetime-v1';
export const AI_PREVIEW_LIFETIME = z.literal('persistent').optional();
export const NODE_PREVIEW_PATH = '/api/node/preview';
export const NODE_PREVIEW_PROTOCOL = 'smarteverything-node-preview.v1';
export const PREVIEW_CHUNK_BYTES = 64 * 1024;
export const AI_PREVIEW_ORIGIN = z
  .string()
  .max(200)
  .refine((value) => {
    if (!/^https?:\/\/(127\.0\.0\.1|\[::1\]):[1-9][0-9]{0,4}$/.test(value)) return false;
    return Number(value.slice(value.lastIndexOf(':') + 1)) <= 65535;
  }, 'Use an explicit HTTP(S) origin with literal 127.0.0.1 or [::1] and an exact port.');
export const AI_PREVIEW_SERVICE_WRITE = z.strictObject({
  origin: AI_PREVIEW_ORIGIN,
  title: z.string().min(1).max(120),
  initial_path: z
    .string()
    .max(4096)
    .default('/')
    .refine((v) => v.startsWith('/') && !v.startsWith('//') && !/[\r\n\\]/.test(v)),
  service_scope: z.literal('authorized_workspace_service'),
});
export type AiPreviewServiceWrite = z.infer<typeof AI_PREVIEW_SERVICE_WRITE>;
export const AI_PREVIEW_PUBLICATION = z.object({
  id: z.uuid(),
  revision: z.uuid(),
  chat_id: z.uuid(),
  profile_id: z.uuid(),
  target: z.object({ kind: z.literal('device'), device_id: z.uuid() }),
  generation: z.uuid(),
  runtime_instance: z.uuid(),
  workspace: z.string().min(1).max(4096),
  title: z.string(),
  source_origin: AI_PREVIEW_ORIGIN,
  initial_path: z.string(),
  expires_at: z.iso.datetime().nullable(),
});
export type AiPreviewPublication = z.infer<typeof AI_PREVIEW_PUBLICATION>;
export const AI_PREVIEW_GATEWAY = z.object({
  ready: z.boolean(),
  base_domain: z.string().nullable(),
  reason: z.string().nullable(),
});
export const AI_PREVIEW_CATALOGUE = z.object({
  capability: z.literal(AI_PREVIEW_CAPABILITY),
  publications: z.array(AI_PREVIEW_PUBLICATION),
  documents: z.array(AI_HTML_PREVIEW_PUBLICATION).default([]),
  gateway: AI_PREVIEW_GATEWAY,
});
export type AiPreviewCatalogue = z.infer<typeof AI_PREVIEW_CATALOGUE>;
export const AI_PREVIEW_LEASE = z.object({
  publication_id: z.uuid(),
  revision: z.uuid(),
  profile_id: z.uuid(),
  target: AI_PREVIEW_PUBLICATION.shape.target,
  generation: z.uuid(),
  url: z.url(),
  origin: z.url(),
  expires_at: z.iso.datetime().nullable(),
});
export type AiPreviewLease = z.infer<typeof AI_PREVIEW_LEASE>;
export const AI_PREVIEW_NATIVE_REQUEST = z.discriminatedUnion('operation', [
  ...AI_FILE_PREVIEW_NATIVE_REQUEST.options,
  z.strictObject({
    operation: z.literal('preview_publish'),
    call_id: z.string().min(1).max(200),
    call_seq: z.int().nonnegative(),
    arguments: z.record(z.string(), JSON_VALUE),
    claim: DSH_WRITER_CLAIM_WRITE,
    service: AI_PREVIEW_SERVICE_WRITE,
    workspace: z.string().min(1).max(4096),
    service_handle: z.uuid(),
  }),
  z.strictObject({
    operation: z.literal('preview_revoke'),
    call_id: z.string().min(1).max(200),
    call_seq: z.int().nonnegative(),
    arguments: z.record(z.string(), JSON_VALUE),
    claim: DSH_WRITER_CLAIM_WRITE,
    publication_id: z.uuid(),
  }),
]);
export const NODE_PREVIEW_CONNECT = z.strictObject({
  type: z.literal('preview_connect'),
  device_id: z.uuid(),
  generation: z.uuid(),
  runtime_instance: z.uuid(),
  stream_id: z.uuid(),
  ticket: z.string().regex(/^[a-f0-9]{64}$/),
});
export const HUB_PREVIEW_OPEN = z.strictObject({
  type: z.literal('preview_open'),
  device_id: z.uuid(),
  generation: z.uuid(),
  runtime_instance: z.uuid(),
  stream_id: z.uuid(),
  ticket: NODE_PREVIEW_CONNECT.shape.ticket,
  publication_id: z.uuid(),
  revision: z.uuid(),
  service_handle: z.uuid(),
  expires_at: z.iso.datetime(),
});
export type HubPreviewOpen = z.infer<typeof HUB_PREVIEW_OPEN>;

export const AI_PREVIEW_NOTICE = z.object({
  type: z.literal('ai_preview'),
  chat_id: z.uuid(),
  profile_id: z.uuid(),
  publication_id: z.uuid(),
  state: z.enum(['published', 'revoked']),
  content_changed: z.boolean().optional(),
  revision: z.uuid().optional(),
});
export type AiPreviewNotice = z.infer<typeof AI_PREVIEW_NOTICE>;
