import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  FILE_CHUNK_BYTES,
  FILE_TOOL_CHANGE,
  FILE_UPLOAD_RESULT,
  FILE_WRITE_RESULT,
  type FileToolChange,
  type FileUploadResult,
  type FileWriteResult,
} from '@smarteverything/domain';
import { operate, type OperatingContext } from './acting';
import { readableAttachment } from './assistant';
import { flatChange, type Chosen } from './computer-flat';
import { defineTool } from './registry';

export type FilesContext = OperatingContext & { readonly assistantFiles: string };

type Upload = Extract<FileToolChange, { action: 'upload' }>;

async function uploaded(
  context: FilesContext,
  deviceId: string,
  change: Upload,
): Promise<FileUploadResult> {
  const file = readableAttachment(context, change.attachmentId);
  const content = await readFile(join(context.assistantFiles, file.storage_path));
  const send = async (start: number): Promise<FileUploadResult> => {
    const end = Math.min(start + FILE_CHUNK_BYTES, content.byteLength);
    const result = FILE_UPLOAD_RESULT.parse(
      await operate(context, 'uploadComputerFile', {
        params: { deviceId },
        body: {
          path: change.path,
          start,
          data: content.subarray(start, end).toString('base64'),
          final: end >= content.byteLength,
          replace: change.replace,
        },
      }),
    );
    return end >= content.byteLength ? result : send(end);
  };
  return send(0);
}

function written(result: FileWriteResult): Record<string, unknown> {
  const failed = result.failed.length;
  return {
    ok: failed === 0,
    summary: `${String(result.done.length)} done${failed === 0 ? '' : `, ${String(failed)} failed`}`,
    done: result.done.map((item) => ({
      path: item.path,
      ...(item.newPath === null ? {} : { newPath: item.newPath }),
      ...(item.trashId === null ? {} : { trashId: item.trashId }),
    })),
    ...(failed === 0 ? {} : { failed: result.failed }),
  };
}

export async function changeFiles(
  context: FilesContext,
  { deviceId, change }: Chosen<FileToolChange>,
): Promise<Record<string, unknown>> {
  if (change.action === 'upload') {
    const result = await uploaded(context, deviceId, change);
    return { ok: true, summary: `Saved ${result.path} (${String(result.size)} bytes)`, ...result };
  }
  const body = await operate(context, 'writeComputerFiles', { params: { deviceId }, body: change });
  return written(FILE_WRITE_RESULT.parse(body));
}

export const FILES_INPUT = flatChange(FILE_TOOL_CHANGE.options);

export const EDIT_FILES_TOOL = defineTool({
  name: 'edit_computer_files',
  input: FILES_INPUT,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  answer: true,
  run: async (context, request) => ({ structured: await changeFiles(context, request) }),
});
