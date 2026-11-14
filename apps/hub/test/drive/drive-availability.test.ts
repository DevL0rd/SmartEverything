import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeRootMarker } from '../../src/drive/root-marker';
import type { StoredDrive } from '../../src/store/repositories/drive-roots';
import { availabilityOf } from '../../src/server/handlers/drive-availability';
import { sharedDriveRoot } from '../store/drive-roots-fixture';

const ID = '0d000000-0000-4000-8000-000000000001';

let base = '';

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-drive-availability-')));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

function driveAt(path: string): StoredDrive {
  return { ...sharedDriveRoot(ID), path };
}

describe('drive availability', () => {
  it('is online when the folder carries the marker of the drive', async () => {
    await writeRootMarker(base, ID);
    expect(await availabilityOf()(driveAt(base))).toBe('online');
  });

  it('is different when the folder carries the marker of another drive or none', async () => {
    expect(await availabilityOf()(driveAt(base))).toBe('different');
    await writeRootMarker(base, '0d000000-0000-4000-8000-000000000009');
    expect(await availabilityOf()(driveAt(base))).toBe('different');
  });

  it('is missing when the folder is gone', async () => {
    expect(await availabilityOf()(driveAt(join(base, 'gone')))).toBe('missing');
  });
});
