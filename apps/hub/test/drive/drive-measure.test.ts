import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { backup, DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

const run = promisify(execFile);
const COUNT = z.object({ count: z.number() });
const INTEGRITY = z.object({ integrity_check: z.string() });
const POOL_SIZE = 4;
const WRITES_DURING_BACKUP = 20;
const SCHEMA =
  'create table item (id integer primary key, root integer, path text not null, dev integer, ino integer, size integer, mtime integer, rev integer, etag text)';
const INSERT =
  'insert into item (root, path, dev, ino, size, mtime, rev, etag) values (?, ?, ?, ?, ?, ?, ?, ?)';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-drive-measure-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function openDatabase(name: string): DatabaseSync {
  const database = new DatabaseSync(join(directory, name));
  database.exec('pragma journal_mode = wal');
  database.exec('pragma synchronous = normal');
  database.exec('pragma busy_timeout = 60000');
  database.exec(SCHEMA);
  return database;
}

function insertRows(database: DatabaseSync, from: number, to: number): void {
  const statement = database.prepare(INSERT);
  database.exec('begin immediate');
  for (let index = from; index < to; index++) {
    statement.run(
      index % 4,
      `/library/album${String(index % 97)}/file-${String(index)}.jpg`,
      1,
      index,
      index * 7,
      index,
      1,
      `e${String(index)}`,
    );
  }
  database.exec('commit');
}

function countRows(database: DatabaseSync): number {
  return COUNT.parse(database.prepare('select count(*) as count from item').get()).count;
}

function longestCommit(rows: number, batch: number): number {
  const database = openDatabase(`batch-${String(batch)}.db`);
  let longest = 0;
  for (let from = 0; from < rows; from += batch) {
    const started = performance.now();
    insertRows(database, from, Math.min(rows, from + batch));
    longest = Math.max(longest, performance.now() - started);
  }
  expect(countRows(database)).toBe(rows);
  database.close();
  return longest;
}

const WRITER = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const database = new DatabaseSync(workerData.file);
database.exec('pragma busy_timeout = 60000');
const statement = database.prepare('insert into item (root, path) values (1, ?)');
for (let batch = 0; batch < workerData.batches; batch++) {
  database.exec('begin immediate');
  for (let row = 0; row < workerData.size; row++) statement.run('/worker/' + batch + '/' + row);
  database.exec('commit');
}
database.close();
parentPort.postMessage('done');
`;

function startWriter(file: string, batches: number, size: number): Promise<void> {
  const worker = new Worker(WRITER, { eval: true, workerData: { file, batches, size } });
  return new Promise((resolve, reject) => {
    worker.once('message', () => {
      resolve();
    });
    worker.once('error', reject);
  });
}

const FIFO_SCENARIO = `
const fs = require('node:fs');
const path = require('node:path');
const dir = process.argv[1];
const blocked = Number(process.argv[2]);
const fifos = [];
for (let i = 0; i < blocked; i++) {
  const fifo = path.join(dir, 'hung' + i);
  require('node:child_process').execFileSync('mkfifo', [fifo]);
  fifos.push(fifo);
  fs.promises.open(fifo, 'r').catch(() => undefined);
}
setTimeout(async () => {
  const free = await Promise.race([
    fs.promises.readFile(path.join(dir, 'unrelated.txt')).then(() => 'free'),
    new Promise((resolve) => setTimeout(() => resolve('blocked'), 500)),
  ]);
  console.log(free);
  for (const fifo of fifos) fs.closeSync(fs.openSync(fifo, fs.constants.O_RDWR));
  process.exit(0);
}, 200);
`;

async function unrelatedReadWhileHung(blocked: number): Promise<string> {
  const scenario = await mkdtemp(join(directory, 'fifo-'));
  await writeFile(join(scenario, 'unrelated.txt'), 'x');
  const { stdout } = await run(process.execPath, ['-e', FIFO_SCENARIO, scenario, String(blocked)], {
    env: { UV_THREADPOOL_SIZE: String(POOL_SIZE) },
  });
  return stdout.trim();
}

async function digest(file: string, chunk: number): Promise<string> {
  const hash = createHash('sha256');
  for await (const part of createReadStream(file, { highWaterMark: chunk })) {
    hash.update(z.instanceof(Uint8Array).parse(part));
  }
  return hash.digest('hex');
}

describe('commit batch size', () => {
  it('commits every row and a larger batch holds the loop longer than a smaller one', () => {
    const small = longestCommit(20_000, 200);
    const large = longestCommit(20_000, 20_000);
    expect(large).toBeGreaterThan(small);
  });
});

describe('second connection in a worker thread beside the main writer', () => {
  it('both writers finish with no busy error and no lost row', async () => {
    const file = join(directory, 'shared.db');
    const main = openDatabase('shared.db');
    const worker = startWriter(file, 20, 500);
    let next = 0;
    const state = { finished: false };
    void worker.then(() => {
      state.finished = true;
    });
    while (!state.finished) {
      insertRows(main, next, next + 100);
      next += 100;
      await new Promise((resolve) => setImmediate(resolve));
    }
    await worker;
    expect(countRows(main)).toBe(next + 20 * 500);
    main.close();
  });
});

describe('consistent database copy', () => {
  it('VACUUM INTO writes a complete copy that passes the integrity check', () => {
    const source = openDatabase('source.db');
    insertRows(source, 0, 5000);
    source.exec(`vacuum into '${join(directory, 'vacuum.db')}'`);
    const copy = new DatabaseSync(join(directory, 'vacuum.db'));
    expect(countRows(copy)).toBe(5000);
    expect(INTEGRITY.parse(copy.prepare('pragma integrity_check').get()).integrity_check).toBe(
      'ok',
    );
    copy.close();
    source.close();
  });

  it('the backup API copies a database that keeps accepting writes while it runs', async () => {
    const source = openDatabase('live.db');
    insertRows(source, 0, 5000);
    let writes = 0;
    const copying = backup(source, join(directory, 'live-copy.db'), { rate: 5 });
    while (writes < WRITES_DURING_BACKUP) {
      insertRows(source, 5000 + writes, 5001 + writes);
      writes++;
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(await copying).toBeGreaterThan(0);
    const copy = new DatabaseSync(join(directory, 'live-copy.db'));
    expect(INTEGRITY.parse(copy.prepare('pragma integrity_check').get()).integrity_check).toBe(
      'ok',
    );
    expect(countRows(copy)).toBeGreaterThanOrEqual(5000);
    expect(countRows(copy)).toBeLessThanOrEqual(countRows(source));
    copy.close();
    source.close();
  });
});

describe('scrub read', () => {
  it('the digest does not depend on the read chunk size', async () => {
    const file = join(directory, 'scrub.bin');
    await writeFile(file, Buffer.alloc(3 * 1024 * 1024 + 17, 9));
    expect(await digest(file, 64 * 1024)).toBe(await digest(file, 1024 * 1024));
  });
});

describe('a call that never returns in the libuv thread pool', () => {
  it('leaves the pool usable until every thread is blocked, then starves unrelated reads', async () => {
    expect(await unrelatedReadWhileHung(POOL_SIZE - 1)).toBe('free');
    expect(await unrelatedReadWhileHung(POOL_SIZE)).toBe('blocked');
  });
});
