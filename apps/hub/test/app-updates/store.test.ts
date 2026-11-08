import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { ApiError, type AppUpdateEntry } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubLayout } from '../../src/data-layout';
import {
  AppUpdateIndexError,
  blobFile,
  blobFolder,
  blobSize,
  indexFile,
  pruneBlobs,
  publishEntry,
  readIndex,
  receiveBlob,
  referencedHashes,
  updateFolder,
  updateIndex,
} from '../../src/app-updates/store';
import { appendEntry, writeBlob } from '../support/app-update-blobs';
import { testLayout } from '../support/test-layout';

const ID = '3f1c2a7e-8f44-4b8d-9f0e-0a2f6a1b7c11';
const OTHER_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const run = promisify(execFile);
const STORE_URL = new URL('../../src/app-updates/store.ts', import.meta.url);
const LAYOUT_URL = new URL('../../src/data-layout/index.ts', import.meta.url);

let data: HubLayout;
let base = '';
let scratch = '';

beforeEach(async () => {
  base = mkdtempSync(join(tmpdir(), 'update-store-data-'));
  data = await testLayout(base);
  scratch = mkdtempSync(join(tmpdir(), 'update-store-source-'));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

function source(name: string, text: string): string {
  const file = join(scratch, name);
  writeFileSync(file, text);
  return file;
}

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function entry(id: string): AppUpdateEntry {
  return {
    id,
    platform: 'desktop',
    channel: 'dev',
    runtimeVersion: 'abc123',
    createdAt: '2026-10-25T10:00:00.000Z',
    appVersion: '0.1.0',
    notes: 'a note',
    launch: null,
    files: [],
    expoClient: null,
    withdrawn: null,
  };
}

async function appendElsewhere(entries: readonly AppUpdateEntry[]): Promise<void> {
  await run(process.execPath, [
    '--import',
    'tsx',
    '--input-type=module',
    '--eval',
    'const { updateIndex } = await import(process.argv[1]); const { hubLayout } = await import(process.argv[4]); const layout = hubLayout(process.argv[2], {}); await Promise.all(JSON.parse(process.argv[3]).map((entry) => updateIndex(layout, (current) => ({ index: { entries: [...current.entries, entry] }, result: undefined }))));',
    STORE_URL.href,
    data.root,
    JSON.stringify(entries),
    LAYOUT_URL.href,
  ]);
}

describe('receiveBlob', () => {
  it('names the blob by its sha256 and reports its size', async () => {
    const staged = await receiveBlob(data, sha('hello'), Readable.from([Buffer.from('hello')]));
    expect(staged).toEqual({ sha256: sha('hello'), size: 5 });
    expect(readFileSync(blobFile(data, sha('hello')), 'utf8')).toBe('hello');
    expect(readdirSync(blobFolder(data))).toEqual([sha('hello')]);
  });

  it('refuses bytes that do not match the name and leaves nothing behind', async () => {
    const refused = receiveBlob(data, sha('promised'), Readable.from([Buffer.from('other')]));
    await expect(refused).rejects.toThrow(ApiError);
    expect(readdirSync(blobFolder(data))).toEqual([]);
    expect(await blobSize(data, sha('promised'))).toBeNull();
  });

  it('accepts an empty file under the sha256 of nothing', async () => {
    const staged = await receiveBlob(data, sha(''), Readable.from([]));
    expect(staged).toEqual({ sha256: sha(''), size: 0 });
    expect(await blobSize(data, sha(''))).toBe(0);
  });

  it('refuses a name that is not a sha256', async () => {
    await expect(
      receiveBlob(data, '../escape', Readable.from([Buffer.from('x')])),
    ).rejects.toThrow();
    expect(existsSync(join(updateFolder(data), 'escape'))).toBe(false);
  });

  it('replaces a blob that exists with another size', async () => {
    const target = blobFile(data, sha('whole'));
    mkdirSync(blobFolder(data), { recursive: true });
    writeFileSync(target, 'cut');
    expect(await blobSize(data, sha('whole'))).toBe(3);
    await receiveBlob(data, sha('whole'), Readable.from([Buffer.from('whole')]));
    expect(readFileSync(target, 'utf8')).toBe('whole');
  });

  it('receives identical uploads concurrently into one shared blob', async () => {
    await Promise.all([
      receiveBlob(data, sha('twin'), Readable.from([Buffer.from('twin')])),
      receiveBlob(data, sha('twin'), Readable.from([Buffer.from('twin')])),
    ]);
    expect(readdirSync(blobFolder(data))).toEqual([sha('twin')]);
    expect(readFileSync(blobFile(data, sha('twin')), 'utf8')).toBe('twin');
  });
});

describe('index', () => {
  it('is empty before the first publish', async () => {
    expect(await readIndex(data)).toEqual({ entries: [] });
  });

  it('replaces the index through a renamed file', async () => {
    await updateIndex(data, () => ({ index: { entries: [entry(ID)] }, result: undefined }));
    expect(existsSync(`${indexFile(data)}.next`)).toBe(false);
    expect(indexFile(data)).toBe(join(data.system.updates.appUpdates, 'index.json'));
    expect(updateFolder(data)).toBe(data.system.updates.appUpdates);
    expect((await readIndex(data)).entries.map((one) => one.id)).toEqual([ID]);
  });

  it('appends after the entries that exist', async () => {
    await appendEntry(data, entry(ID));
    const next = await appendEntry(data, entry(OTHER_ID));
    expect(next.entries.map((one) => one.id)).toEqual([ID, OTHER_ID]);
    expect((await readIndex(data)).entries).toHaveLength(2);
  });

  it('keeps every append when publishers race in separate processes', async () => {
    const entries = Array.from({ length: 12 }, () => entry(randomUUID()));
    await Promise.all([appendElsewhere(entries.slice(0, 6)), appendElsewhere(entries.slice(6))]);
    expect((await readIndex(data)).entries.map((one) => one.id).sort()).toEqual(
      entries.map((one) => one.id).sort(),
    );
  });

  it('refuses an entry the domain schema rejects and keeps the index', async () => {
    await appendEntry(data, entry(ID));
    await expect(appendEntry(data, { ...entry(OTHER_ID), notes: '' })).rejects.toThrow();
    expect((await readIndex(data)).entries).toHaveLength(1);
  });

  it('names the file when the index is not JSON', async () => {
    mkdirSync(updateFolder(data), { recursive: true });
    writeFileSync(indexFile(data), '{nope');
    await expect(readIndex(data)).rejects.toThrow(AppUpdateIndexError);
    await expect(readIndex(data)).rejects.toThrow(indexFile(data));
  });

  it('names the file when the index has the wrong shape', async () => {
    mkdirSync(updateFolder(data), { recursive: true });
    writeFileSync(indexFile(data), JSON.stringify({ entries: [{ id: 'x' }] }));
    await expect(readIndex(data)).rejects.toThrow(AppUpdateIndexError);
  });
});

describe('prune', () => {
  it('does not prune a blob between writing it and publishing its entry', async () => {
    let markStaged = (): void => {
      throw new Error('The staging signal was not initialized');
    };
    const staged = new Promise<void>((resolve) => {
      markStaged = resolve;
    });
    const publish = publishEntry(data, async () => {
      const blob = await writeBlob(data, {
        source: source('p', 'publication'),
        path: 'p.html',
        contentType: 'text/html',
      });
      markStaged();
      return { ...entry(ID), files: [blob] };
    });
    await staged;
    const [, removed] = await Promise.all([publish, pruneBlobs(data)]);
    expect(removed).toEqual([]);
    expect(existsSync(blobFile(data, sha('publication')))).toBe(true);
  });

  it('prunes nothing when the blob folder does not exist yet', async () => {
    expect(await pruneBlobs(data)).toEqual([]);
  });

  it('removes only the blobs that no entry references, withdrawn entries included', async () => {
    const kept = await writeBlob(data, {
      source: source('k', 'kept'),
      path: 'k.html',
      contentType: 'text/html',
    });
    const held = await writeBlob(data, {
      source: source('h', 'held'),
      path: 'h.html',
      contentType: 'text/html',
    });
    const dropped = await writeBlob(data, {
      source: source('d', 'dropped'),
      path: 'd.html',
      contentType: 'text/html',
    });
    await appendEntry(data, { ...entry(ID), files: [kept] });
    await appendEntry(data, {
      ...entry(OTHER_ID),
      launch: held,
      withdrawn: { at: '2026-10-25T10:05:00.000Z', reason: 'bad' },
    });
    expect(referencedHashes(await readIndex(data))).toEqual(new Set([kept.sha256, held.sha256]));
    expect(await pruneBlobs(data)).toEqual([dropped.sha256]);
    expect(existsSync(blobFile(data, dropped.sha256))).toBe(false);
    expect(existsSync(blobFile(data, kept.sha256))).toBe(true);
    expect(existsSync(blobFile(data, held.sha256))).toBe(true);
  });
});

describe('updateIndex', () => {
  it('takes its write lock at the layout lock file', async () => {
    await appendEntry(data, entry(ID));
    expect(existsSync(data.system.updates.appUpdatesLock)).toBe(true);
  });

  it('replaces the index with the changed one and returns the result', async () => {
    await appendEntry(data, entry(ID));
    const result = await updateIndex(data, (current) => ({
      index: { entries: [...current.entries, entry(OTHER_ID)] },
      result: current.entries.length,
    }));
    expect(result).toBe(1);
    expect((await readIndex(data)).entries).toHaveLength(2);
    expect(existsSync(`${indexFile(data)}.next`)).toBe(false);
  });

  it('keeps the index when the change throws', async () => {
    await appendEntry(data, entry(ID));
    await expect(
      updateIndex(data, () => {
        throw new Error('no');
      }),
    ).rejects.toThrow('no');
    expect((await readIndex(data)).entries).toHaveLength(1);
  });
});
