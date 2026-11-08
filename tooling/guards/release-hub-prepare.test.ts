import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { lockDataDirectory } from '../../apps/hub/src/data-lock.ts';
import { dataLayoutOf } from '../release-hub-files.ts';
import { execPath } from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dataPreparationCommand, prepareHubData, withHubDataLock } from '../release-hub-prepare.ts';

let directory = '';
let install = '';
let data = '';
let service = '';

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'hub-preparation-'));
  install = join(directory, 'install with spaces');
  data = join(directory, 'data with spaces');
  service = join(install, 'resources/service/service.mjs');
  mkdirSync(dirname(service), { recursive: true });
  mkdirSync(join(install, 'node/bin'), { recursive: true });
  mkdirSync(data);
  symlinkSync(execPath, join(install, 'node/bin/node'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('packaged offline preparation', () => {
  it('uses the installed Node and service with the explicit data root as separate arguments', async () => {
    writeFileSync(
      service,
      `import { writeFileSync } from 'node:fs';
      if (process.argv[2] !== '--prepare-data') process.exit(7);
      writeFileSync(process.argv[3] + '/prepared', process.argv[3]);`,
    );
    expect(dataPreparationCommand(install, data)).toEqual({
      executable: join(install, 'node/bin/node'),
      args: [service, '--prepare-data', data],
    });
    await prepareHubData(install, data);
    expect(readFileSync(join(data, 'prepared'), 'utf8')).toBe(data);
  });

  it('rejects a failed preparation instead of treating child exit as ready', async () => {
    writeFileSync(service, 'process.exit(7);');
    await expect(prepareHubData(install, data)).rejects.toThrow('preparation failed (7)');
    expect(existsSync(join(data, 'prepared'))).toBe(false);
  });
  it('refuses restoration while preparation still owns the existing data lock', async () => {
    const lock = await lockDataDirectory(dataLayoutOf(data));
    let changed = false;
    try {
      await expect(
        withHubDataLock(data, () => {
          changed = true;
          return Promise.resolve();
        }),
      ).rejects.toThrow('already using');
      expect(changed).toBe(false);
    } finally {
      await lock.release();
    }
    await withHubDataLock(data, () => {
      changed = true;
      return Promise.resolve();
    });
    expect(changed).toBe(true);
  });
});
