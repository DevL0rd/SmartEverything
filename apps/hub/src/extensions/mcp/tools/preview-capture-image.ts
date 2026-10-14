import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PREVIEW_CAPTURE_RESULT, PREVIEW_CAPTURE_MAX_BYTES } from '@smarteverything/domain';
import { ToolError, type ToolContext, type ToolOutput } from './registry';
export async function previewCaptureImage(
  context: ToolContext,
  value: unknown,
): Promise<ToolOutput> {
  const result = PREVIEW_CAPTURE_RESULT.parse(value);
  const file = context.store.assistantChat.attachment(result.artifactId);
  if (
    file.profile_id !== result.scope.profileId ||
    file.mime !== 'image/png' ||
    file.bytes > PREVIEW_CAPTURE_MAX_BYTES
  )
    throw new ToolError('The preview image attachment changed its scope or format.', 'forbidden');
  const content = await readFile(join(context.assistantFiles, file.storage_path));
  return {
    structured: { result },
    images: [{ mimeType: file.mime, data: content.toString('base64') }],
  };
}
