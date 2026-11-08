import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppUpdateCompatible } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UpdateVerificationError } from '../../src/updates/update-errors.js';
import { downloadBundle, type BundleProgress } from '../../src/web-bundles/bundle-download.js';

const ID = '3f1c0f6e-3a55-4d0e-9c43-0d3d1d7c2a11';
const RUNTIME = 'a'.repeat(32);
const CREATED_AT = '2026-10-20T00:00:00.000Z';
const FILES = new Map<string, Buffer>([
  ['index.html', Buffer.from('<html>home</html>')],
  ['_expo/static/js/web/entry.js', Buffer.from('console.log("entry")')],
  ['assets/logo.png', Buffer.from('png bytes')],
]);

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'bundle-download-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function offerOf(
  overrides: { sha256?: string; paths?: readonly string[] } = {},
): AppUpdateCompatible {
  const paths = overrides.paths ?? [...FILES.keys()];
  return {
    id: ID,
    createdAt: CREATED_AT,
    appVersion: '1.2.3',
    notes: 'a change',
    size: 0,
    files: paths.map((file, index) => {
      const bytes = FILES.get(file) ?? Buffer.from(file);
      return {
        path: file,
        sha256: index === 0 ? (overrides.sha256 ?? sha256(bytes)) : sha256(bytes),
        size: bytes.length,
        contentType: 'application/octet-stream',
        url: `/media/app-updates/${sha256(bytes)}?expires=1&signature=ab`,
      };
    }),
  };
}

const served: typeof fetch = (input) => {
  const url = input instanceof Request ? input.url : input.toString();
  for (const bytes of FILES.values()) {
    if (url.includes(sha256(bytes))) return Promise.resolve(new Response(bytes));
  }
  return Promise.resolve(new Response(Buffer.from('unknown file')));
};

function run(offer: AppUpdateCompatible, progress: BundleProgress[] = []): Promise<string> {
  return downloadBundle({
    directory,
    offer,
    runtime: RUNTIME,
    serverUrl: 'https://home.example:7880',
    fetch: served,
    onProgress: (value) => {
      progress.push(value);
    },
  });
}

describe('downloading a web bundle', () => {
  it('writes every file under its path, then bundle.json, and renames the folder', async () => {
    const progress: BundleProgress[] = [];
    const folder = await run(offerOf(), progress);
    expect(folder).toBe(path.join(directory, ID));
    for (const [file, bytes] of FILES) {
      expect(await readFile(path.join(folder, ...file.split('/')))).toStrictEqual(bytes);
    }
    expect(JSON.parse(await readFile(path.join(folder, 'bundle.json'), 'utf8'))).toStrictEqual({
      id: ID,
      runtimeVersion: RUNTIME,
      createdAt: CREATED_AT,
    });
    expect(await readdir(directory)).toStrictEqual([ID]);
  });

  it('reports received against the total of every file', async () => {
    const progress: BundleProgress[] = [];
    await run(offerOf(), progress);
    const total = [...FILES.values()].reduce((sum, bytes) => sum + bytes.length, 0);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((value) => value.total === total)).toBe(true);
    expect(progress.at(-1)).toStrictEqual({ received: total, total });
  });

  it('removes the partial folder when a file has the wrong hash', async () => {
    await expect(run(offerOf({ sha256: 'f'.repeat(64) }))).rejects.toThrow(UpdateVerificationError);
    expect(await readdir(directory)).toStrictEqual([]);
  });

  it('refuses a path that leaves the bundle folder before writing anything', async () => {
    await expect(run(offerOf({ paths: ['../escape.js'] }))).rejects.toThrow(/relative path/u);
    expect(await readdir(directory)).toStrictEqual([]);
  });

  it('refuses a bundle without an entry page before downloading', async () => {
    await expect(run(offerOf({ paths: ['_expo/static/js/web/entry.js'] }))).rejects.toThrow(
      UpdateVerificationError,
    );
    expect(await readdir(directory)).toStrictEqual([]);
  });

  it('replaces the folder of an earlier download of the same id', async () => {
    await run(offerOf());
    await run(offerOf());
    expect(await readdir(directory)).toStrictEqual([ID]);
  });
});
