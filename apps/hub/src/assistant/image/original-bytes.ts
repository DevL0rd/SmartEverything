import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ApiError, IMAGE_BYTES_MAX } from '@smarteverything/domain';
import type { StoredAttachment } from '../../store/repositories/assistant-files';

const ORIGINAL_READ_CHUNK = 256 * 1024;
export async function originalBytes(
  path: string,
  file: StoredAttachment,
  signal: AbortSignal,
): Promise<Buffer> {
  const info = await stat(path);
  if (!info.isFile() || info.size !== file.bytes || info.size > IMAGE_BYTES_MAX)
    throw new ApiError('invalid_request', 'An original image no longer matches its stored length.');
  const reader = createReadStream(path, { signal, highWaterMark: ORIGINAL_READ_CHUNK });
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of reader) {
    if (!Buffer.isBuffer(chunk))
      throw new ApiError('invalid_request', 'Original image bytes were not binary.');
    bytes += chunk.length;
    if (bytes > file.bytes || bytes > IMAGE_BYTES_MAX)
      throw new ApiError('invalid_request', 'An original image exceeded its retained byte limit.');
    chunks.push(chunk);
  }
  signal.throwIfAborted();
  const content = Buffer.concat(chunks);
  if (bytes !== file.bytes || createHash('sha256').update(content).digest('hex') !== file.sha256)
    throw new ApiError(
      'invalid_request',
      'An original image no longer matches its retained digest or length.',
    );
  return content;
}
