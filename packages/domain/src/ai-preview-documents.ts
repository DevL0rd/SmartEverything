import { z } from 'zod';
import { AI_PROJECT_PATH } from './ai-project-files';

export const AI_PREVIEW_HTML_MAX = 1024 * 1024;
export const AI_FILE_PREVIEW_SOURCE = z.object({
  device_id: z.uuid(),
  workspace: z.string().min(1).max(4096),
  file_path: z.string().min(1).max(4096),
});
export const AI_PROJECT_PREVIEW_SOURCE = z.object({
  root: AI_PROJECT_PATH.refine((path) => path.startsWith('workspace')),
  entry: z
    .string()
    .min(1)
    .max(4096)
    .refine(
      (path) =>
        /\.html?$/iu.test(path) &&
        !path.startsWith('/') &&
        !/[\\%\0]/u.test(path) &&
        !path.split('/').some((part) => part === '' || part === '.' || part === '..'),
    ),
  standalone: z.boolean().default(false),
});
export const AI_PROJECT_PREVIEW_WRITE = z.strictObject({
  title: z.string().min(1).max(120),
  root: AI_PROJECT_PREVIEW_SOURCE.shape.root,
  entry: AI_PROJECT_PREVIEW_SOURCE.shape.entry.default('index.html'),
  publication_id: z.uuid().optional(),
  revision: z.uuid().optional(),
});
export type AiProjectPreviewWrite = z.output<typeof AI_PROJECT_PREVIEW_WRITE>;
export type AiProjectPreviewSource = z.output<typeof AI_PROJECT_PREVIEW_SOURCE>;
export const AI_HTML_PREVIEW_WRITE = z.strictObject({
  title: z.string().min(1).max(120),
  html: z.string().max(AI_PREVIEW_HTML_MAX),
  publication_id: z.uuid().optional(),
  revision: z.uuid().optional(),
});
export const AI_HTML_PREVIEW_PUBLICATION = z.object({
  kind: z.literal('html'),
  file_source: AI_FILE_PREVIEW_SOURCE.optional(),
  project_source: AI_PROJECT_PREVIEW_SOURCE.optional(),
  id: z.uuid(),
  revision: z.uuid(),
  chat_id: z.uuid(),
  profile_id: z.uuid(),
  title: z.string(),
  initial_path: z.literal('/'),
  expires_at: z.iso.datetime().nullable(),
});
export type AiHtmlPreviewPublication = z.infer<typeof AI_HTML_PREVIEW_PUBLICATION>;
export type AiHtmlPreviewWrite = z.infer<typeof AI_HTML_PREVIEW_WRITE>;
export const AI_HTML_PREVIEW_LEASE = z.object({
  publication_id: z.uuid(),
  revision: z.uuid(),
  profile_id: z.uuid(),
  url: z.url(),
  origin: z.url(),
  expires_at: z.iso.datetime().nullable(),
});
export type AiHtmlPreviewLease = z.infer<typeof AI_HTML_PREVIEW_LEASE>;
