import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bootstrapDirectory,
  hubLayout,
  readLocation,
  readMarker,
  resolveHubRoot,
  verifyMarker,
  writeLocation,
  writeMarker,
} from '../../src/data-layout';
import { testLayout } from '../support/test-layout';

const ROOT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
let work: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'data-layout-'));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

describe('bootstrapDirectory', () => {
  it('honours SMARTEVERYTHING_HUB_HOME first', () => {
    expect(
      bootstrapDirectory({ SMARTEVERYTHING_HUB_HOME: '/mnt/config', XDG_CONFIG_HOME: '/x' }),
    ).toBe('/mnt/config');
  });

  it('uses the XDG config folder', () => {
    expect(bootstrapDirectory({ XDG_CONFIG_HOME: '/x' })).toBe('/x/SmartEverything-Hub');
  });

  it('falls back to the home config folder', () => {
    expect(bootstrapDirectory({})).toMatch(/\.config\/SmartEverything-Hub$/);
  });

  it('refuses a relative hub home', () => {
    expect(() => bootstrapDirectory({ SMARTEVERYTHING_HUB_HOME: 'rel' })).toThrow();
  });
});

describe('location pointer', () => {
  it('resolves the pointer from the bootstrap folder', async () => {
    const location = { root: join(work, 'data'), rootId: ROOT_ID, state: 'active' } as const;
    await writeLocation(work, location);
    expect(await resolveHubRoot({ SMARTEVERYTHING_HUB_HOME: work })).toEqual(location);
  });

  it('names the file when the pointer is missing', async () => {
    await expect(resolveHubRoot({ SMARTEVERYTHING_HUB_HOME: work })).rejects.toThrow(
      join(work, 'location.json'),
    );
  });

  it('refuses unknown fields and invalid content', async () => {
    await writeFile(join(work, 'location.json'), JSON.stringify({ root: '/a', extra: 1 }));
    await expect(readLocation(work)).rejects.toThrow('location.json');
    await writeFile(join(work, 'location.json'), 'not json');
    await expect(readLocation(work)).rejects.toThrow('not valid JSON');
  });

  it('keeps the old pointer when a crash happens between write and rename', async () => {
    const first = { root: join(work, 'one'), rootId: ROOT_ID, state: 'active' } as const;
    await writeLocation(work, first);
    const crash = { rename: (): Promise<void> => Promise.reject(new Error('crash')) };
    await expect(writeLocation(work, { ...first, root: join(work, 'two') }, crash)).rejects.toThrow(
      'crash',
    );
    expect(await readLocation(work)).toEqual(first);
    expect(await readdir(work)).toEqual(['location.json']);
    expect(JSON.parse(await readFile(join(work, 'location.json'), 'utf8'))).toEqual(first);
  });
});

describe('marker', () => {
  it('accepts the marker of the pointer root id', async () => {
    const layout = await testLayout(join(work, 'data'), ROOT_ID);
    expect((await verifyMarker(layout, ROOT_ID)).state).toBe('active');
  });

  it('refuses a missing marker', async () => {
    const layout = hubLayout(join(work, 'absent'), {});
    await expect(verifyMarker(layout, ROOT_ID)).rejects.toThrow(
      `the data folder at ${layout.root} is missing or is a different disk (not mounted?)`,
    );
  });

  it('refuses a different root id', async () => {
    const layout = await testLayout(join(work, 'data'), OTHER_ID);
    await expect(verifyMarker(layout, ROOT_ID)).rejects.toThrow('different disk');
  });

  it('refuses a moved marker and names where it went', async () => {
    const layout = await testLayout(join(work, 'data'), ROOT_ID);
    await writeMarker(layout, {
      version: 1,
      rootId: ROOT_ID,
      createdAt: new Date().toISOString(),
      state: 'moved',
      movedTo: join(work, 'new-home'),
    });
    await expect(verifyMarker(layout, ROOT_ID)).rejects.toThrow(join(work, 'new-home'));
  });

  it('reads back what was written and refuses unknown fields', async () => {
    const layout = await testLayout(join(work, 'data'), ROOT_ID);
    expect((await readMarker(layout))?.rootId).toBe(ROOT_ID);
    await mkdir(join(work, 'data'), { recursive: true });
    await writeFile(layout.marker, JSON.stringify({ version: 1, rootId: ROOT_ID, extra: true }));
    await expect(readMarker(layout)).rejects.toThrow();
  });
});
