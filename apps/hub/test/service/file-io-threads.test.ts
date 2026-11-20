import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FileIoThreads from '../../src/service/file-io-threads';

let folder = '';
let file = '';
const original = env['UV_THREADPOOL_SIZE'];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'file-io-threads-'));
  file = join(folder, 'smarteverything.db');
  vi.resetModules();
});

afterEach(async () => {
  if (original === undefined) delete env['UV_THREADPOOL_SIZE'];
  else env['UV_THREADPOOL_SIZE'] = original;
  await rm(folder, { recursive: true, force: true });
});

function seed(settings: Record<string, unknown> | null): void {
  const database = new DatabaseSync(file);
  database.exec('create table ai_settings (key text primary key, settings text not null)');
  if (settings !== null) {
    database
      .prepare("insert into ai_settings (key, settings) values ('drive', ?)")
      .run(JSON.stringify(settings));
  }
  database.close();
}

async function module(): Promise<typeof FileIoThreads> {
  return import('../../src/service/file-io-threads');
}

describe('the file I/O threads at start', () => {
  it('sets the libuv pool size from the saved value', async () => {
    seed({ fileIoThreads: 24 });
    const { applyFileIoThreads } = await module();
    expect(applyFileIoThreads(file)).toEqual({ threads: 24, source: 'saved' });
    expect(env['UV_THREADPOOL_SIZE']).toBe('24');
  });

  it('uses the default and says so while the tuning migration has not seeded the row', async () => {
    seed({ uploadExpiryDays: 7 });
    const { applyFileIoThreads } = await module();
    expect(applyFileIoThreads(file)).toEqual({ threads: 8, source: 'unseeded' });
    expect(env['UV_THREADPOOL_SIZE']).toBe('8');
  });

  it('uses the default for a database that does not exist yet', async () => {
    const { applyFileIoThreads } = await module();
    expect(applyFileIoThreads(file)).toEqual({ threads: 8, source: 'unseeded' });
  });

  it('uses the default when the data folder is still being migrated', async () => {
    const { applyFileIoThreads } = await module();
    expect(applyFileIoThreads(null)).toEqual({ threads: 8, source: 'unseeded' });
  });

  it('refuses a saved value outside the libuv range', async () => {
    seed({ fileIoThreads: 2000 });
    const { applyFileIoThreads } = await module();
    expect(() => applyFileIoThreads(file)).toThrow();
  });

  it('refuses to report before the pool was confirmed', async () => {
    const { runningFileIoThreads } = await module();
    expect(() => runningFileIoThreads()).toThrow(/not applied/);
  });

  it('fails loudly when the running pool differs from the configured value', async () => {
    seed({ fileIoThreads: 3 });
    const { confirmFileIoThreads } = await module();
    await expect(confirmFileIoThreads(file)).rejects.toThrow(/thread pool has \d+ threads/);
  });
});
