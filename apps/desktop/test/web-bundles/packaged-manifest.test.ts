import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readWebStamp, WebStampMissingError } from '../../src/web-bundles/packaged-manifest.js';

const RUNTIME = 'a'.repeat(32);

let appPath = '';

async function writeManifest(manifest: unknown): Promise<void> {
  await writeFile(path.join(appPath, 'package.json'), JSON.stringify(manifest));
}

beforeEach(async () => {
  appPath = await mkdtemp(path.join(tmpdir(), 'packaged-manifest-'));
});

afterEach(async () => {
  await rm(appPath, { recursive: true, force: true });
});

describe('readWebStamp', () => {
  it('reads the runtime and the embedded build date of a packaged build', async () => {
    await writeManifest({
      name: 'x',
      webRuntime: RUNTIME,
      webEmbedded: { createdAt: '2026-10-25T10:00:00.000Z' },
    });
    expect(await readWebStamp({ appPath, packaged: true })).toEqual({
      runtime: RUNTIME,
      embeddedCreatedAt: '2026-10-25T10:00:00.000Z',
    });
  });

  it('names the problem when a packaged build has no stamp', async () => {
    await writeManifest({ name: 'x' });
    await expect(readWebStamp({ appPath, packaged: true })).rejects.toBeInstanceOf(
      WebStampMissingError,
    );
  });

  it('names the problem when the stamp is malformed', async () => {
    await writeManifest({
      webRuntime: 'short',
      webEmbedded: { createdAt: '2026-10-25T10:00:00.000Z' },
    });
    await expect(readWebStamp({ appPath, packaged: true })).rejects.toThrow(/webRuntime/u);
    await writeManifest({ webRuntime: RUNTIME, webEmbedded: { createdAt: 'yesterday' } });
    await expect(readWebStamp({ appPath, packaged: true })).rejects.toBeInstanceOf(
      WebStampMissingError,
    );
  });

  it('gives an unpackaged copy no stamp without reading anything', async () => {
    expect(
      await readWebStamp({ appPath: path.join(appPath, 'missing'), packaged: false }),
    ).toBeNull();
  });
});
