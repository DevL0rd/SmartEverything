import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { configuredLayout, hubLayout, type HubLayout } from '../../src/data-layout';

let directory: string;
let layout: HubLayout;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-database-folder-'));
  layout = hubLayout(join(directory, 'data'), {});
  await mkdir(dirname(layout.system.config.service), { recursive: true });
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function configure(value: Readonly<Record<string, unknown>>): Promise<void> {
  await writeFile(layout.system.config.service, JSON.stringify(value));
}

it('keeps the database, its WAL and SHM in the configured folder and the rest in the data folder', async () => {
  const folder = join(directory, 'fast');
  await mkdir(folder);
  await configure({ go2rtcBinary: '/opt/go2rtc', database: folder });
  const configured = configuredLayout(layout);
  expect(configured.system.database).toEqual({
    file: join(folder, 'smarteverything.db'),
    wal: join(folder, 'smarteverything.db-wal'),
    shm: join(folder, 'smarteverything.db-shm'),
  });
  expect(configured.home.drive).toBe(layout.home.drive);
  expect(configured.system.logs.runtimeLogs).toBe(layout.system.logs.runtimeLogs);
});

it('refuses to start without a configured database folder', async () => {
  await configure({ go2rtcBinary: '/opt/go2rtc' });
  expect(() => configuredLayout(layout)).toThrow(/must set "database"/u);
  await configure({ go2rtcBinary: '/opt/go2rtc', database: 'relative' });
  expect(() => configuredLayout(layout)).toThrow(/absolute/u);
});

it('refuses a configured database folder that does not exist', async () => {
  await configure({ go2rtcBinary: '/opt/go2rtc', database: join(directory, 'missing') });
  expect(() => configuredLayout(layout)).toThrow(/does not exist/u);
});
