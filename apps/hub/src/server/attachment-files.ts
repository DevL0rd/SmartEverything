import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { inlineAssistantAttachmentMime } from '@smarteverything/domain';
import { attachment } from '../computers/file-download';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import { serveBytes } from './file-serve';

export async function sendAssistantAttachment(
  file: StoredAttachment,
  path: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const inline = inlineAssistantAttachmentMime(file.mime);
  await serveBytes(
    {
      size: (await stat(path)).size,
      headers: {
        'content-type': inline ?? 'application/octet-stream',
        'referrer-policy': 'no-referrer',
        ...(inline === null
          ? {
              'cache-control': 'no-store',
              'content-disposition': attachment(file.name),
              'content-security-policy': "sandbox; default-src 'none'",
            }
          : { 'cache-control': 'private, max-age=600' }),
      },
      stream: (range) => createReadStream(path, range),
    },
    request,
    response,
  );
}
