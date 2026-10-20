import { ASSISTANT_ATTACHMENT_BYTES_MAX } from '@smarteverything/domain';
import {
  finishAssistantUpload,
  sendAssistantUploadChunk,
  startAssistantUpload,
} from '../../../api/assistant';
import { base64Of } from '../../../features/assistant/data/uploads';
import { bytes } from '../../../format/number';
import type { PickedFile } from '../../../platform/pick-files';

export class DocumentTooLargeError extends Error {
  override readonly name = 'DocumentTooLargeError';

  constructor(size: number) {
    super(`The file is ${bytes(size)}; the limit is ${bytes(ASSISTANT_ATTACHMENT_BYTES_MAX)}.`);
  }
}

export async function uploadDocument(
  file: PickedFile,
  onProgress: (share: number) => void,
): Promise<string> {
  const data = await file.data();
  if (data.byteLength > ASSISTANT_ATTACHMENT_BYTES_MAX) {
    throw new DocumentTooLargeError(data.byteLength);
  }
  const upload = await startAssistantUpload({
    name: file.name,
    mime: file.mime,
    bytes: data.byteLength,
  });
  const chunks = Math.ceil(data.byteLength / upload.chunkBytes);
  for (let index = 0; index < chunks; index += 1) {
    const start = index * upload.chunkBytes;
    const end = Math.min(data.byteLength, start + upload.chunkBytes);
    await sendAssistantUploadChunk(upload.uploadId, index, base64Of(data, start, end));
    onProgress(end / data.byteLength);
  }
  const attachment = await finishAssistantUpload(upload.uploadId);
  return attachment.id;
}
