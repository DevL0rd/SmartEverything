import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { COMPUTER_DATA_DIRECTORY_VARIABLE } from '@smarteverything/domain';
import { systemdUnit } from '../../../src/service/definitions.js';
import { serviceLocations } from '../../../src/service/locations.js';

const BLOCK_BYTES = 4 * 1024 * 1024;
const ROWS = 2000;

const WORKER_SOURCE = `
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { parentPort, threadId, workerData } from 'node:worker_threads';

const db = new DatabaseSync(workerData.database);
db.exec('pragma busy_timeout = 5000');
const insert = db.prepare('insert into pending_ops (op_id, kind, payload, state) values (?, ?, ?, ?)');
db.exec('begin immediate');
for (let index = 0; index < workerData.rows; index += 1) {
  insert.run('worker-' + index, 'push', new Uint8Array([index % 256]), 'queued');
}
db.exec('commit');
const block = new Uint8Array(workerData.blockBytes).fill(7);
const digest = createHash('sha256').update(block).digest('hex');
db.close();
parentPort.postMessage({ digest, threadId });
`;

const PROBE_SOURCE = `
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

const [directory, rows, blockBytes] = process.argv.slice(2);
const database = join(directory, 'drive-sync.sqlite');
const db = new DatabaseSync(database, { enableForeignKeyConstraints: true });
db.exec('pragma busy_timeout = 5000');
db.exec('pragma journal_mode = wal');
db.exec('pragma synchronous = normal');
db.exec('pragma user_version = 1');
db.exec('create table files (root_id text not null, rel_path text not null, bytes integer not null, mtime_ns integer not null, blocks blob, primary key (root_id, rel_path)) strict, without rowid');
db.exec('create table pending_ops (op_id text primary key, kind text not null, payload blob not null, state text not null) strict');
const mtimeNs = 1762500000123456789n;
db.prepare('insert into files values (?, ?, ?, ?, ?)').run('root', 'a/b.txt', 3, mtimeNs, new Uint8Array([1, 2, 3]));
const read = db.prepare('select mtime_ns from files');
read.setReadBigInts(true);
const stored = read.get();

const worker = new Worker(new URL('./worker.mjs', import.meta.url), {
  workerData: { database, rows: Number(rows), blockBytes: Number(blockBytes) },
});
const reply = await new Promise((resolve, reject) => {
  worker.once('message', resolve);
  worker.once('error', reject);
});
const counted = db.prepare('select count(*) as n from pending_ops').get();
const mode = db.prepare('pragma journal_mode').get();
const version = db.prepare('pragma user_version').get();
const mainDigest = createHash('sha256').update(new Uint8Array(Number(blockBytes)).fill(7)).digest('hex');
db.close();
await worker.terminate();
console.log(JSON.stringify({
  node: process.versions.node,
  electron: process.versions.electron ?? null,
  sqlite: new DatabaseSync(':memory:').prepare('select sqlite_version() as v').get().v,
  mtimeNs: String(stored.mtime_ns),
  workerRows: counted.n,
  workerDigestMatches: reply.digest === mainDigest,
  journalMode: mode.journal_mode,
  userVersion: version.user_version,
}));
`;

const REPORT = z.object({
  node: z.string(),
  electron: z.string().nullable(),
  sqlite: z.string(),
  mtimeNs: z.string(),
  workerRows: z.number(),
  workerDigestMatches: z.boolean(),
  journalMode: z.string(),
  userVersion: z.number(),
});

let scratch = '';
let probe = '';
let runs = 0;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'drive-runtime-spike-'));
  probe = join(scratch, 'probe.mjs');
  await writeFile(probe, PROBE_SOURCE);
  await writeFile(join(scratch, 'worker.mjs'), WORKER_SOURCE);
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

async function runProbe(
  executable: string,
  environment: Readonly<Record<string, string>>,
): Promise<unknown> {
  const data = join(scratch, `data-${String(runs)}`);
  runs += 1;
  await mkdir(data);
  const result = spawnSync(executable, [probe, data, String(ROWS), String(BLOCK_BYTES)], {
    encoding: 'utf8',
    env: { ...environment },
  });
  expect(result.status, result.stderr).toBe(0);
  const line = result.stdout.trim().split('\n').at(-1) ?? '';
  return JSON.parse(line);
}

function expectedReport(report: z.infer<typeof REPORT>): void {
  expect(report.sqlite).toMatch(/^3\.\d+\.\d+/u);
  expect(report.mtimeNs).toBe('1762500000123456789');
  expect(report.workerRows).toBe(ROWS);
  expect(report.workerDigestMatches).toBe(true);
  expect(report.journalMode).toBe('wal');
  expect(report.userVersion).toBe(1);
}

describe('the Computer service runtime for the Drive sync engine', () => {
  it('runs node:sqlite and worker_threads in the Node that runs the tests', async () => {
    const report = REPORT.parse(await runProbe(process.execPath, {}));
    expectedReport(report);
    expect(report.electron).toBeNull();
  });

  const electronPath = z
    .string()
    .catch('')
    .parse(createRequire(import.meta.url)('electron'));
  it.skipIf(electronPath === '' || !existsSync(electronPath))(
    'runs node:sqlite, WAL, nanosecond integers and a hashing worker in Electron as Node, the way the service launches',
    async () => {
      const report = REPORT.parse(await runProbe(electronPath, { ELECTRON_RUN_AS_NODE: '1' }));
      expectedReport(report);
      expect(report.electron).not.toBeNull();
      expect(Number(report.node.split('.')[0])).toBeGreaterThanOrEqual(24);
    },
  );
});

describe('where the Computer service keeps its data', () => {
  it('uses the directory the launcher passes in the Computer variable', () => {
    const dataDirectory = '/home/ann/.config/SmartEverything-node';
    const unit = systemdUnit({
      executable: '/opt/SmartEverything-Desktop/smarteverything',
      entry: '/opt/SmartEverything-Desktop/resources/service/service.mjs',
      dataDirectory,
      path: '/usr/bin',
      efficiencyCores: null,
    });
    expect(unit).toContain(`Environment="${COMPUTER_DATA_DIRECTORY_VARIABLE}=${dataDirectory}"`);
  });

  it('puts the client database beside the service configuration and log', () => {
    const dataDirectory = '/home/ann/.config/SmartEverything-node';
    const locations = serviceLocations({
      home: '/home/ann',
      dataDirectory,
      xdgConfigHome: undefined,
    });
    expect(locations.dataDirectory).toBe(dataDirectory);
    expect(join(locations.dataDirectory, 'drive-sync.sqlite')).toBe(
      '/home/ann/.config/SmartEverything-node/drive-sync.sqlite',
    );
    expect(locations.configFile.startsWith(`${dataDirectory}/`)).toBe(true);
  });
});
