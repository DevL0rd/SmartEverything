import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCATION_FILE } from '../../apps/hub/src/data-layout/index.ts';
import { DataFolderRequiredError, dataRootOf } from '../data-root.ts';

describe('the data folder of the release tools', () => {
  let bootstrap = '';
  let scratch = '';

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'data-root-'));
    bootstrap = join(scratch, 'pointer');
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('uses the --data folder and never reads the pointer', async () => {
    const root = await dataRootOf('relative-data', { SMARTEVERYTHING_HUB_HOME: bootstrap });
    expect(root).toBe(resolve('relative-data'));
  });

  it('fails naming --data when neither the flag nor a pointer exists', async () => {
    const reading = dataRootOf(undefined, { SMARTEVERYTHING_HUB_HOME: bootstrap });
    await expect(reading).rejects.toBeInstanceOf(DataFolderRequiredError);
    await expect(reading).rejects.toThrow(/--data/u);
    await expect(reading).rejects.toThrow(join(bootstrap, LOCATION_FILE));
  });

  it('reads the pointer when no flag is given', async () => {
    const root = join(scratch, 'data');
    await mkdir(bootstrap, { recursive: true });
    await writeFile(
      join(bootstrap, LOCATION_FILE),
      JSON.stringify({ root, rootId: '0b4cbd2a-5c1e-4a52-9f0b-7f5f1a4f3d11', state: 'active' }),
    );
    await expect(dataRootOf(undefined, { SMARTEVERYTHING_HUB_HOME: bootstrap })).resolves.toBe(
      root,
    );
  });
});
