import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ApiError,
  RELEASE_UPLOAD,
  RELEASE_UPLOAD_ID,
  type ReleaseUpload,
  type ReleaseUploadRange,
} from '@smarteverything/domain';
import { isMissing } from '../fs-util';

const RECORD_FILE = 'upload.json';

const HASH_CHUNK_BYTES = 1024 * 1024;

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;

export function mergedRanges(
  ranges: readonly ReleaseUploadRange[],
  added: ReleaseUploadRange,
): ReleaseUploadRange[] {
  const sorted = [...ranges, added].sort((a, b) => a.start - b.start);
  const merged: ReleaseUploadRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }
  return merged;
}

export function receivedBytes(ranges: readonly ReleaseUploadRange[]): number {
  return ranges.reduce((total, range) => total + range.end - range.start, 0);
}

export function missingRanges(
  ranges: readonly ReleaseUploadRange[],
  size: number,
): ReleaseUploadRange[] {
  const missing: ReleaseUploadRange[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) missing.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < size) missing.push({ start: cursor, end: size });
  return missing;
}

export function shownRanges(ranges: readonly ReleaseUploadRange[]): string {
  return ranges.map((range) => `${String(range.start)}-${String(range.end)}`).join(', ');
}

export function plainUploadId(uploadId: string): string {
  const parsed = RELEASE_UPLOAD_ID.safeParse(uploadId);
  if (!parsed.success) throw new ApiError('invalid_request', 'The upload ID is not valid.');
  return parsed.data;
}

export async function writeRecord(directory: string, upload: ReleaseUpload): Promise<void> {
  const target = join(directory, RECORD_FILE);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(RELEASE_UPLOAD.parse(upload), null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, target);
  } catch (cause) {
    await rm(temporary, { force: true });
    throw cause;
  }
}

export async function hashOf(path: string): Promise<string> {
  const handle = await open(path, READ_FLAGS);
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(HASH_CHUNK_BYTES);
  try {
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

export async function readRecord(directory: string): Promise<ReleaseUpload> {
  let text: string;
  try {
    text = await readFile(join(directory, RECORD_FILE), 'utf8');
  } catch (cause) {
    if (isMissing(cause))
      throw new ApiError('not_found', 'There is no such upload; it may have been discarded.');
    throw cause;
  }
  return RELEASE_UPLOAD.parse(JSON.parse(text));
}
