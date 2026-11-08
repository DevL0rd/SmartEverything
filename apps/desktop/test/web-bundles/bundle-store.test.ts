import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  WebBundleIdError,
  WebBundleStore,
  type WebBuild,
} from '../../src/web-bundles/bundle-store.js';

const RUNTIME = 'a'.repeat(32);
const OTHER_RUNTIME = 'b'.repeat(32);
const EMBEDDED_AT = '2026-10-01T00:00:00.000Z';
const NEWER = '2026-10-20T00:00:00.000Z';

let directory = '';
let store: WebBundleStore;
let embeddedRoot = '';
let build: WebBuild;

async function addBundle(
  id: string,
  options: { runtime?: string; createdAt?: string } = {},
): Promise<void> {
  const folder = path.join(directory, id);
  await mkdir(folder, { recursive: true });
  await writeFile(
    path.join(folder, 'bundle.json'),
    JSON.stringify({
      id,
      runtimeVersion: options.runtime ?? RUNTIME,
      createdAt: options.createdAt ?? NEWER,
    }),
  );
}

async function readState(): Promise<unknown> {
  return JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
}

beforeEach(async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'bundle-store-'));
  directory = path.join(parent, 'web-bundles');
  embeddedRoot = path.join(parent, 'embedded');
  build = { runtime: RUNTIME, embeddedCreatedAt: EMBEDDED_AT, embeddedRoot };
  store = new WebBundleStore(directory);
});

afterEach(async () => {
  await rm(path.dirname(directory), { recursive: true, force: true });
});

describe('root resolution', () => {
  it('uses the embedded root when there is no state', async () => {
    expect(await store.rootFor(build)).toBe(embeddedRoot);
  });

  it('serves the active downloaded bundle that fits this build', async () => {
    await addBundle('one');
    await store.begin('one');
    expect(await store.rootFor(build)).toBe(path.join(directory, 'one'));
    expect(await readState()).toMatchObject({ active: 'one', previous: 'embedded', trial: true });
  });

  it.each([
    ['another runtime', { runtime: OTHER_RUNTIME }],
    ['an older bundle', { createdAt: '2026-09-01T00:00:00.000Z' }],
    ['a bundle as old as the embedded build', { createdAt: EMBEDDED_AT }],
  ])('falls back to the embedded root for %s and resets the state', async (_name, options) => {
    await addBundle('one', options);
    await store.begin('one');
    expect(await store.rootFor(build)).toBe(embeddedRoot);
    expect(await readState()).toMatchObject({
      active: 'embedded',
      previous: 'embedded',
      trial: false,
    });
  });

  it('falls back to the embedded root when the folder is missing', async () => {
    await store.begin('gone');
    expect(await store.rootFor(build)).toBe(embeddedRoot);
    expect(await readState()).toMatchObject({ active: 'embedded' });
  });

  it('falls back when bundle.json is missing, invalid or names another id', async () => {
    await mkdir(path.join(directory, 'one'), { recursive: true });
    await store.begin('one');
    expect(await store.rootFor(build)).toBe(embeddedRoot);
    await addBundle('two');
    await writeFile(path.join(directory, 'two', 'bundle.json'), '{"id":"other"}');
    await store.begin('two');
    expect(await store.rootFor(build)).toBe(embeddedRoot);
    await addBundle('three');
    await writeFile(
      path.join(directory, 'three', 'bundle.json'),
      JSON.stringify({ id: 'other', runtimeVersion: RUNTIME, createdAt: NEWER }),
    );
    await store.begin('three');
    expect(await store.rootFor(build)).toBe(embeddedRoot);
  });

  it('keeps the failed list when it resets', async () => {
    await addBundle('bad');
    await store.begin('bad');
    await store.revert('crash');
    await store.begin('gone');
    await store.rootFor(build);
    expect(await store.failed()).toEqual(['bad']);
  });
});

describe('trial, confirm and revert', () => {
  it('confirm ends the trial and keeps the bundle active', async () => {
    await addBundle('one');
    await store.begin('one');
    expect(await store.trialId()).toBe('one');
    await store.confirm();
    expect(await store.trialId()).toBeNull();
    expect(await readState()).toMatchObject({ active: 'one', trial: false });
    expect(await store.rootFor(build)).toBe(path.join(directory, 'one'));
  });

  it('revert restores the previous bundle and records the failure', async () => {
    await addBundle('one');
    await addBundle('two');
    await store.begin('one');
    await store.confirm();
    await store.begin('two');
    expect(await store.revert('render process gone')).toEqual({
      kind: 'reverted',
      failedId: 'two',
      restored: 'one',
    });
    expect(await readState()).toEqual({
      active: 'one',
      previous: 'one',
      trial: false,
      failed: ['two'],
    });
    expect(await store.failed()).toEqual(['two']);
    expect(await store.rootFor(build)).toBe(path.join(directory, 'one'));
  });

  it('revert from the first bundle goes back to the embedded build', async () => {
    await addBundle('one');
    await store.begin('one');
    await store.revert('hang');
    expect(await store.rootFor(build)).toBe(embeddedRoot);
    expect(await store.failed()).toEqual(['one']);
  });

  it('revert outside a trial changes nothing', async () => {
    await addBundle('one');
    await store.begin('one');
    await store.confirm();
    expect(await store.revert('late failure')).toEqual({ kind: 'not_in_trial' });
    expect(await readState()).toMatchObject({ active: 'one', failed: [] });
  });

  it('a second begin during a trial keeps the last confirmed bundle as previous', async () => {
    await addBundle('one');
    await addBundle('two');
    await store.begin('one');
    await store.begin('two');
    await store.revert('crash');
    expect(await readState()).toMatchObject({ active: 'embedded', failed: ['two'] });
  });

  it('beginning an id again after a failure clears it from the failed list', async () => {
    await addBundle('one');
    await store.begin('one');
    await store.revert('crash');
    await store.begin('one');
    expect(await store.failed()).toEqual([]);
  });

  it('refuses ids that are not safe folder names', async () => {
    await expect(store.begin('../x')).rejects.toBeInstanceOf(WebBundleIdError);
    await expect(store.begin('embedded')).rejects.toBeInstanceOf(WebBundleIdError);
    await expect(store.begin('a.part')).rejects.toBeInstanceOf(WebBundleIdError);
  });

  it('runs overlapping calls one after another', async () => {
    await addBundle('one');
    await Promise.all([
      store.begin('one'),
      store.revert('first'),
      store.revert('second'),
      store.confirm(),
    ]);
    expect(await readState()).toEqual({
      active: 'embedded',
      previous: 'embedded',
      trial: false,
      failed: ['one'],
    });
  });
});

describe('durability', () => {
  it('keeps the old state when the process died before the rename', async () => {
    await addBundle('one');
    await store.begin('one');
    await store.confirm();
    await writeFile(path.join(directory, 'state.json.next'), '{"active":"tw');
    const reopened = new WebBundleStore(directory);
    expect(await reopened.rootFor(build)).toBe(path.join(directory, 'one'));
    await reopened.begin('one');
    expect(await readState()).toMatchObject({ active: 'one', trial: true });
    expect((await readdir(directory)).includes('state.json.next')).toBe(false);
  });

  it('resets to the embedded build when state.json cannot be read', async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'state.json'), '{"active":');
    expect(await store.rootFor(build)).toBe(embeddedRoot);
    expect(await readState()).toEqual({
      active: 'embedded',
      previous: 'embedded',
      trial: false,
      failed: [],
    });
  });

  it('rethrows a failure that is not a missing or unreadable file', async () => {
    await mkdir(path.join(directory, 'state.json'), { recursive: true });
    await expect(store.rootFor(build)).rejects.toThrow();
  });
});

describe('removeSuperseded', () => {
  it('deletes bundle folders that are neither active nor previous, and nothing else', async () => {
    await addBundle('old');
    await addBundle('one');
    await addBundle('two');
    await mkdir(path.join(directory, 'download.part'), { recursive: true });
    await store.begin('one');
    await store.confirm();
    await store.begin('two');
    await store.confirm();
    await store.removeSuperseded();
    expect((await readdir(directory)).sort()).toEqual([
      'download.part',
      'one',
      'state.json',
      'two',
    ]);
  });

  it('works before any bundle was ever downloaded', async () => {
    await expect(store.removeSuperseded()).resolves.toBeUndefined();
  });
});
