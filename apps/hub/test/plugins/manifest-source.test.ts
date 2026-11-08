import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLUGIN_MANIFEST_FILE } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findManifest, MANIFEST_BYTE_LIMIT } from '../../src/plugins/manifest-source';

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'manifest-source-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const MANIFEST = {
  id: 'example',
  name: 'Example',
  version: '1.0.0',
  description: 'An example plugin',
  publisher: 'Example',
  mcp: { transport: 'stdio', command: 'node', args: ['server.js'] },
};

describe('manifest byte limit', () => {
  it('reads a folder manifest under the limit', async () => {
    await writeFile(join(folder, PLUGIN_MANIFEST_FILE), JSON.stringify(MANIFEST));
    const found = await findManifest({ source: 'local', path: folder }, fetch);
    expect(found.manifest.id).toBe('example');
  });

  it('rejects a folder manifest over the limit before parsing it', async () => {
    const padded = JSON.stringify({ ...MANIFEST, description: 'x'.repeat(MANIFEST_BYTE_LIMIT) });
    await writeFile(join(folder, PLUGIN_MANIFEST_FILE), padded);
    await expect(findManifest({ source: 'local', path: folder }, fetch)).rejects.toThrow(
      /over the \d+ byte limit/,
    );
  });

  it('rejects a well-known manifest over the limit instead of falling back to a probe', async () => {
    const fetcher: typeof fetch = () =>
      Promise.resolve(new Response('x'.repeat(MANIFEST_BYTE_LIMIT + 1)));
    await expect(
      findManifest({ source: 'url', url: 'https://plugin.example/mcp' }, fetcher),
    ).rejects.toThrow(/over the \d+ byte limit/);
  });

  it('reads a well-known manifest under the limit', async () => {
    const fetcher: typeof fetch = () =>
      Promise.resolve(
        Response.json({
          ...MANIFEST,
          mcp: { transport: 'http', url: 'https://plugin.example/mcp' },
        }),
      );
    const found = await findManifest({ source: 'url', url: 'https://plugin.example/mcp' }, fetcher);
    expect(found.manifest.id).toBe('example');
  });
});
