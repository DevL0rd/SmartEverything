import { randomBytes, timingSafeEqual } from 'node:crypto';
import { link, mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { HubLayout } from '../data-layout';
import { fsCode } from '../fs-code';
import { openResolved, resolveInRoot } from './paths';
import {
  rootAvailability,
  systemProbe,
  volumeIdentitySchema,
  volumeOf,
  type RootAvailability,
  type VolumeProbe,
} from './volumes';

export type RootMarkerFailure = 'missing' | 'invalid' | 'mismatch' | 'exists';

export class RootMarkerError extends Error {
  override readonly name = 'RootMarkerError';

  constructor(
    readonly failure: RootMarkerFailure,
    message: string,
  ) {
    super(message);
  }
}

const ROOT_ID = z.string().regex(/^[A-Za-z0-9_-]+$/);
const MARKER = z.string().regex(/^[0-9a-f]{64}$/);

const markerFileSchema = z.strictObject({ id: ROOT_ID, marker: MARKER });
const linkedRecordSchema = z.strictObject({ id: ROOT_ID, volume: volumeIdentitySchema });

export type RootMarker = z.infer<typeof markerFileSchema>;
export type LinkedRootRecord = z.infer<typeof linkedRecordSchema>;

export const MARKER_DIRECTORY = '.smarteverything';
export const MARKER_FILE = `${MARKER_DIRECTORY}/root.json`;

export type DriveMetaLayout = Pick<HubLayout, 'system'>;

async function writeExclusive(file: string, content: string): Promise<void> {
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, content, { mode: 0o600, flag: 'wx' });
  try {
    await link(temporary, file);
  } catch (cause) {
    if (fsCode(cause) === 'EEXIST') {
      throw new RootMarkerError('exists', 'The root already has an identity marker.');
    }
    throw cause;
  } finally {
    await unlink(temporary);
  }
}

export async function writeRootMarker(rootPath: string, rootId: string): Promise<RootMarker> {
  const marker = markerFileSchema.parse({ id: rootId, marker: randomBytes(32).toString('hex') });
  const target = await resolveInRoot(rootPath, MARKER_FILE);
  await mkdir(dirname(target.absolute), { recursive: true, mode: 0o700 });
  await writeExclusive(target.absolute, JSON.stringify(marker));
  return marker;
}

export async function readRootMarker(rootPath: string): Promise<RootMarker> {
  const resolved = await resolveInRoot(rootPath, MARKER_FILE);
  if (resolved.identity === null) {
    throw new RootMarkerError('missing', 'The root has no identity marker.');
  }
  const handle = await openResolved(resolved, 'read');
  try {
    const text = await handle.readFile('utf8');
    return markerFileSchema.parse(JSON.parse(text));
  } catch (cause) {
    if (cause instanceof SyntaxError || cause instanceof z.ZodError) {
      throw new RootMarkerError('invalid', 'The root identity marker is unreadable.');
    }
    throw cause;
  } finally {
    await handle.close();
  }
}

function sameMarker(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export async function verifyRootMarker(rootPath: string, expected: RootMarker): Promise<void> {
  const found = await readRootMarker(rootPath);
  if (found.id !== expected.id || !sameMarker(found.marker, expected.marker)) {
    throw new RootMarkerError('mismatch', 'The directory is not the root that was registered.');
  }
}

function linkedRecordFile(layout: DriveMetaLayout, rootId: string): string {
  return join(layout.system.driveMeta(ROOT_ID.parse(rootId)), 'root.json');
}

export async function writeLinkedRecord(
  layout: DriveMetaLayout,
  rootId: string,
  rootPath: string,
  probe: VolumeProbe = systemProbe,
): Promise<LinkedRootRecord> {
  const record = linkedRecordSchema.parse({
    id: rootId,
    volume: (await volumeOf(rootPath, probe)).identity,
  });
  const file = linkedRecordFile(layout, rootId);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(record), { mode: 0o600, flag: 'wx' });
  await rename(temporary, file);
  return record;
}

export async function removeLinkedRecord(layout: DriveMetaLayout, rootId: string): Promise<void> {
  await rm(layout.system.driveMeta(ROOT_ID.parse(rootId)), { recursive: true, force: true });
}

export async function readLinkedRecord(
  layout: DriveMetaLayout,
  rootId: string,
): Promise<LinkedRootRecord> {
  let text: string;
  try {
    text = await readFile(linkedRecordFile(layout, rootId), 'utf8');
  } catch (cause) {
    if (fsCode(cause) === 'ENOENT') {
      throw new RootMarkerError('missing', 'The linked root has no identity record.');
    }
    throw cause;
  }
  try {
    return linkedRecordSchema.parse(JSON.parse(text));
  } catch (cause) {
    if (cause instanceof SyntaxError || cause instanceof z.ZodError) {
      throw new RootMarkerError('invalid', 'The linked root identity record is unreadable.');
    }
    throw cause;
  }
}

export async function linkedRootAvailability(
  layout: DriveMetaLayout,
  rootId: string,
  rootPath: string,
  probe: VolumeProbe = systemProbe,
): Promise<RootAvailability> {
  const record = await readLinkedRecord(layout, rootId);
  if (record.id !== rootId) {
    throw new RootMarkerError('mismatch', 'The identity record belongs to another root.');
  }
  return rootAvailability(record.volume, rootPath, probe);
}
