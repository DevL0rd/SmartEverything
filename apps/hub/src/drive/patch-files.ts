import { constants } from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

export type ByteRange = readonly [start: number, end: number];

export interface ContentPatch {
  readonly ranges: readonly ByteRange[];
  readonly size: number;
}

const CHUNK_BYTES = 1024 * 1024;

const MAGIC = 'drive-undo-log-1:';

const HEADER = z.strictObject({
  size: z.int().nonnegative(),
  entries: z.array(z.tuple([z.int().nonnegative(), z.int().positive()])),
});

type Header = z.infer<typeof HEADER>;

const NOFOLLOW = constants.O_NOFOLLOW;

interface Span {
  readonly from: number;
  readonly to: number;
  readonly length: number;
}

async function copyRange(source: FileHandle, target: FileHandle, span: Span): Promise<void> {
  const { from, to, length } = span;
  const buffer = Buffer.allocUnsafe(Math.min(CHUNK_BYTES, Math.max(length, 1)));
  for (let done = 0; done < length;) {
    const wanted = Math.min(buffer.length, length - done);
    const { bytesRead } = await source.read(buffer, 0, wanted, from + done);
    if (bytesRead === 0) {
      throw new Error('A file ended before the bytes to copy.');
    }
    let written = 0;
    while (written < bytesRead) {
      const result = await target.write(buffer, written, bytesRead - written, to + done + written);
      written += result.bytesWritten;
    }
    done += bytesRead;
  }
}

export function undoEntries(
  originalSize: number,
  patch: ContentPatch,
): readonly (readonly [number, number])[] {
  const covered: [number, number][] = [];
  for (const [start, end] of patch.ranges) {
    const until = Math.min(end, originalSize);
    if (until > start) covered.push([start, until]);
  }
  if (patch.size < originalSize) covered.push([patch.size, originalSize]);
  covered.sort((left, right) => left[0] - right[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of covered) {
    const last = merged.at(-1);
    if (last !== undefined && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged.map(([start, end]) => [start, end - start]);
}

async function syncAndClose(handle: FileHandle): Promise<void> {
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncParent(path: string): Promise<void> {
  const directory = await open(dirname(path), 'r');
  await syncAndClose(directory);
}

async function writeUndoBody(
  source: FileHandle,
  target: FileHandle,
  patch: ContentPatch,
): Promise<void> {
  const originalSize = Number((await source.stat({ bigint: true })).size);
  const entries = undoEntries(originalSize, patch);
  const header: Header = { size: originalSize, entries: entries.map(([s, n]) => [s, n]) };
  const head = Buffer.from(`${MAGIC}${JSON.stringify(header)}\n`);
  await target.write(head, 0, head.length, 0);
  let position = head.length;
  for (const [start, length] of entries) {
    await copyRange(source, target, { from: start, to: position, length });
    position += length;
  }
  await target.sync();
}

async function writeUndoFile(
  source: FileHandle,
  temporary: string,
  patch: ContentPatch,
): Promise<void> {
  const target = await open(temporary, 'wx', 0o600);
  let complete = false;
  try {
    await writeUndoBody(source, target, patch);
    complete = true;
  } finally {
    await target.close();
    if (!complete) await rm(temporary, { force: true });
  }
}

export async function writeUndoLog(
  live: string,
  undo: string,
  temporary: string,
  patch: ContentPatch,
): Promise<void> {
  const source = await open(live, constants.O_RDONLY | NOFOLLOW);
  try {
    await writeUndoFile(source, temporary, patch);
  } finally {
    await source.close();
  }
  await rename(temporary, undo);
  await syncParent(undo);
}

async function readHeader(handle: FileHandle): Promise<{ header: Header; offset: number }> {
  const probe = Buffer.allocUnsafe(CHUNK_BYTES);
  const chunks: Buffer[] = [];
  let offset = 0;
  for (;;) {
    const { bytesRead } = await handle.read(probe, 0, probe.length, offset);
    if (bytesRead === 0) {
      throw new Error('The undo log has no header.');
    }
    const newline = probe.subarray(0, bytesRead).indexOf(0x0a);
    if (newline >= 0) {
      chunks.push(Buffer.from(probe.subarray(0, newline)));
      offset += newline + 1;
      break;
    }
    chunks.push(Buffer.from(probe.subarray(0, bytesRead)));
    offset += bytesRead;
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.startsWith(MAGIC)) {
    throw new Error('The undo log has an unknown format.');
  }
  return { header: HEADER.parse(JSON.parse(text.slice(MAGIC.length))), offset };
}

export async function restoreUndoLog(live: string, undo: string): Promise<void> {
  const log = await open(undo, 'r');
  try {
    const { header, offset } = await readHeader(log);
    const target = await open(live, constants.O_WRONLY | NOFOLLOW);
    try {
      let position = offset;
      for (const [start, length] of header.entries) {
        await copyRange(log, target, { from: position, to: start, length });
        position += length;
      }
      await target.truncate(header.size);
      await target.sync();
    } finally {
      await target.close();
    }
  } finally {
    await log.close();
  }
}

export async function applyPatch(live: string, staged: string, patch: ContentPatch): Promise<void> {
  const source = await open(staged, 'r');
  try {
    const target = await open(live, constants.O_RDWR | NOFOLLOW);
    try {
      for (const [start, end] of patch.ranges) {
        await copyRange(source, target, { from: start, to: start, length: end - start });
      }
      await target.truncate(patch.size);
      await target.sync();
    } finally {
      await target.close();
    }
  } finally {
    await source.close();
  }
}
