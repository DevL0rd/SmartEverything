import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HUB_UNIT_BOOTSTRAP,
  HUB_UNIT_FILE,
  bootstrapDirectory,
  HUB_OOM_SCORE_ADJUST,
  hubUnitText,
  reloadUserManager,
  userUnitDirectory,
  writeHubUnit,
} from '../../src/data-layout';

const SPEC = {
  install: '%h/.local/opt/Hub',
  node: 'node/bin/node',
  entry: 'resources/service/service.mjs',
};
let work: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'hub-unit-'));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

describe('hubUnitText', () => {
  it('works in the bootstrap folder and carries no data folder variable or environment file', () => {
    const text = hubUnitText(SPEC);
    expect(text).toContain(`WorkingDirectory=${HUB_UNIT_BOOTSTRAP}`);
    expect(text).toContain(
      'ExecStart="%h/.local/opt/Hub/node/bin/node" "%h/.local/opt/Hub/resources/service/service.mjs"',
    );
    expect(text).not.toContain('SMARTEVERYTHING_DATA_DIRECTORY');
    expect(text).not.toContain('EnvironmentFile');
    expect(text).not.toContain('RequiresMountsFor');
  });

  it('asks the kernel to keep the hub alive in favor of a build scope', () => {
    expect(hubUnitText(SPEC)).toContain('\nOOMScoreAdjust=-500\n');
    expect(HUB_OOM_SCORE_ADJUST).toBeLessThan(0);
  });

  it('names the same folder as the pointer resolver', () => {
    const folder = bootstrapDirectory({ XDG_CONFIG_HOME: '/x' });
    expect(HUB_UNIT_BOOTSTRAP.replace('%E', '/x')).toBe(folder);
  });
});

describe('userUnitDirectory', () => {
  it('uses the XDG config folder when absolute', () => {
    expect(userUnitDirectory({ XDG_CONFIG_HOME: '/x' })).toBe('/x/systemd/user');
  });

  it('ignores a relative XDG config folder', () => {
    expect(userUnitDirectory({ XDG_CONFIG_HOME: 'x' })).toMatch(/\.config\/systemd\/user$/);
  });
});

describe('writeHubUnit', () => {
  it('writes the unit atomically and leaves no staged file', async () => {
    const directory = join(work, 'units');
    const file = await writeHubUnit(directory, 'one');
    expect(file).toBe(join(directory, HUB_UNIT_FILE));
    await writeHubUnit(directory, 'two');
    expect(await readFile(file, 'utf8')).toBe('two');
    expect(await readdir(directory)).toEqual([HUB_UNIT_FILE]);
  });

  it('keeps the old unit when the final rename fails', async () => {
    const directory = join(work, 'units');
    const file = await writeHubUnit(directory, 'old');
    await expect(
      writeHubUnit(directory, 'new', {
        rename: () => Promise.reject(new Error('crash before rename')),
      }),
    ).rejects.toThrow('crash before rename');
    expect(await readFile(file, 'utf8')).toBe('old');
    expect(await readdir(directory)).toEqual([HUB_UNIT_FILE]);
  });
});

describe('reloadUserManager', () => {
  it('runs daemon-reload on the user manager through the runner', async () => {
    const calls: string[] = [];
    await reloadUserManager((command, args) => {
      calls.push([command, ...args].join(' '));
      return Promise.resolve();
    });
    expect(calls).toEqual(['systemctl --user daemon-reload']);
  });

  it('reports a failed reload', async () => {
    await expect(reloadUserManager(() => Promise.reject(new Error('no bus')))).rejects.toThrow(
      'no bus',
    );
  });
});
