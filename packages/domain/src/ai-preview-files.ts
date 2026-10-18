import { z } from 'zod';
import type { HubHarnessControl } from './node/harness-frames';
import { DSH_WRITER_CLAIM_WRITE } from './dsh-sessions';
import { AI_PREVIEW_HTML_MAX } from './ai-preview-documents';
export const AI_PREVIEW_FILE_CAPABILITY = 'preview-files-v1';
export const AI_FILE_PREVIEW_WRITE = z.strictObject({
  file_path: z.string().min(1).max(4096),
  title: z.string().min(1).max(120),
});
export const AI_FILE_PREVIEW_NATIVE_REQUEST = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal('preview_file_abandon'),
    claim: DSH_WRITER_CLAIM_WRITE,
    watch_handle: z.uuid(),
  }),
  z.strictObject({
    operation: z.literal('preview_file_publish'),
    claim: DSH_WRITER_CLAIM_WRITE,
    workspace: z.string().min(1).max(4096),
    file_path: z.string().min(1).max(4096),
    title: z.string().min(1).max(120),
    html: z.string().max(AI_PREVIEW_HTML_MAX),
    watch_handle: z.uuid(),
  }),
  z.strictObject({
    operation: z.literal('preview_file_validate'),
    claim: DSH_WRITER_CLAIM_WRITE,
    publication_id: z.uuid(),
    watch_handle: z.uuid(),
  }),
  z.strictObject({
    operation: z.literal('preview_file_update'),
    claim: DSH_WRITER_CLAIM_WRITE,
    publication_id: z.uuid(),
    revision: z.uuid(),
    watch_handle: z.uuid(),
    html: z.string().max(AI_PREVIEW_HTML_MAX),
  }),
]);
export const HUB_PREVIEW_FILE_CLOSE = z.strictObject({
  type: z.literal('preview_file_close'),
  device_id: z.uuid(),
  generation: z.uuid(),
  runtime_instance: z.uuid(),
  watch_handle: z.uuid(),
});
export type HubPreviewFileClose = z.infer<typeof HUB_PREVIEW_FILE_CLOSE>;

export function isPreviewControl(
  frame: HubHarnessControl,
): frame is Extract<HubHarnessControl, { type: 'preview_open' | 'preview_file_close' }> {
  return frame.type === 'preview_open' || frame.type === 'preview_file_close';
}
