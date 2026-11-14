import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountedPlacement } from './placement-fixture.js';
import { FilePlacementCache } from '../../src/drive-mount/placement-cache.js';

const PLACEMENT = mountedPlacement();

let folder = '';

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'drive-cache-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('FilePlacementCache', () => {
  it('is empty before the first write, round trips and clears', () => {
    const cache = new FilePlacementCache(
      join(folder, 'nested', 'p.json'),
      new Logger('desktop.test'),
    );
    expect(cache.all()).toEqual([]);
    cache.replaceAll([PLACEMENT]);
    expect(cache.all()).toEqual([PLACEMENT]);
    cache.clear();
    expect(cache.all()).toEqual([]);
  });

  it('ignores a file that no longer matches the contract', async () => {
    const file = join(folder, 'p.json');
    await writeFile(file, JSON.stringify([{ id: 'x' }]));
    expect(new FilePlacementCache(file, new Logger('desktop.test')).all()).toEqual([]);
  });
});
