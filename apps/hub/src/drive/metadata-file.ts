import type { FileHandle } from 'node:fs/promises';
import { messageOf } from '@smarteverything/logging';
import { fsCode } from '../fs-code';
import { NOTHING, readStill, readTimed, routeOf, type TimedProbe } from './metadata-read';
import type { MediaFacts } from './metadata-read';
import type { MetadataOutcome, MetadataRequest } from './metadata-protocol';
import { DrivePathError, openResolved, resolveInRoot } from './paths';

const HEAD_BYTES = 12;

interface Extracted {
  readonly facts: MediaFacts;
  readonly unreadable: string | null;
}

async function extract(probe: TimedProbe, handle: FileHandle, bytes: number): Promise<Extracted> {
  const head = Buffer.alloc(HEAD_BYTES);
  const { bytesRead } = await handle.read(head, 0, HEAD_BYTES, 0);
  try {
    const facts =
      routeOf(head.subarray(0, bytesRead)) === 'still'
        ? readStill(await handle.readFile())
        : readTimed(await probe.analyze(handle, bytes));
    return { facts, unreadable: null };
  } catch (cause) {
    if (fsCode(cause) !== undefined) throw cause;
    return { facts: NOTHING, unreadable: messageOf(cause) };
  }
}

async function readOpen(
  probe: TimedProbe,
  handle: FileHandle,
  request: MetadataRequest,
): Promise<MetadataOutcome> {
  const before = await handle.stat({ bigint: true });
  if (
    !before.isFile() ||
    before.dev.toString() !== request.dev ||
    before.ino.toString() !== request.ino
  ) {
    return { kind: 'changed', reason: 'identity' };
  }
  const bytes = Number(before.size);
  const { facts, unreadable } = await extract(probe, handle, bytes);
  const after = await handle.stat({ bigint: true });
  if (after.size !== before.size || after.mtimeNs !== before.mtimeNs) {
    return { kind: 'changed', reason: 'modified' };
  }
  return { kind: 'read', facts, bytes, modifiedMs: Number(before.mtimeMs), unreadable };
}

export async function readMediaFile(
  probe: TimedProbe,
  request: MetadataRequest,
): Promise<MetadataOutcome> {
  try {
    const handle = await openResolved(
      await resolveInRoot(request.rootPath, request.relPath),
      'read',
    );
    try {
      return await readOpen(probe, handle, request);
    } finally {
      await handle.close();
    }
  } catch (cause) {
    const reason =
      cause instanceof DrivePathError ? cause.failure : (fsCode(cause) ?? messageOf(cause));
    return { kind: 'skipped', reason };
  }
}
