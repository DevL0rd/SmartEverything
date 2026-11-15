import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conflictPair, parseWriterLog, renamedFolderEntries } from './two-checks.ts';
import { EDIT_TOOL, INSERT_TOOL, LOCK_TOOL, WRITER_TOOL, writerContent } from './two-scripts.ts';

const execute = promisify(execFile);
const SCRATCH = '/var/tmp/claude-agents';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(SCRATCH, 'two-test-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function python(source: string, args: readonly string[]): Promise<{ stdout: string }> {
  return execute('python3', ['-I', '-c', source, ...args]);
}

function background(source: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-I', '-c', source, ...args], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`exit ${String(code)}`));
    });
  });
}

async function until(path: string): Promise<void> {
  for (let attempt = 0; attempt < 200 && !existsSync(path); attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 25));
  expect(existsSync(path)).toBe(true);
}

describe.each(['posix', 'flock'])('the %s lock tool', (kind) => {
  it('refuses a second exclusive lock with EAGAIN and waits for the release', async () => {
    const file = join(directory, 'locked');
    await writeFile(file, '');
    const ready = join(directory, 'ready');
    const release = join(directory, 'release');
    const holder = background(LOCK_TOOL, ['hold', file, kind, 'ex', ready, release]);
    await until(ready);
    expect((await python(LOCK_TOOL, ['try', file, kind, 'ex'])).stdout.trim()).toBe('EAGAIN');
    const waiting = join(directory, 'waiting');
    const acquired = join(directory, 'acquired');
    const waiter = background(LOCK_TOOL, ['wait', file, kind, 'ex', waiting, acquired]);
    await until(waiting);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(existsSync(acquired)).toBe(false);
    await writeFile(release, '');
    await holder;
    await waiter;
    expect(existsSync(acquired)).toBe(true);
  });

  it('lets shared locks coexist and refuses an exclusive one', async () => {
    const file = join(directory, 'locked');
    await writeFile(file, '');
    const ready = join(directory, 'ready');
    const release = join(directory, 'release');
    const holder = background(LOCK_TOOL, ['hold', file, kind, 'sh', ready, release]);
    await until(ready);
    expect((await python(LOCK_TOOL, ['try', file, kind, 'sh'])).stdout.trim()).toBe('ACQUIRED');
    expect((await python(LOCK_TOOL, ['try', file, kind, 'ex'])).stdout.trim()).toBe('EAGAIN');
    await writeFile(release, '');
    await holder;
  });
});

describe('the insert tool', () => {
  it('writes every row in its own transaction', async () => {
    const database = join(directory, 'db');
    await execute('sqlite3', [database, 'create table rows(who text, number integer)']);
    await Promise.all([
      python(INSERT_TOOL, [database, 'a', '25']),
      python(INSERT_TOOL, [database, 'b', '25']),
    ]);
    const { stdout } = await execute('sqlite3', [
      database,
      'pragma integrity_check; select count(*), count(distinct who || number) from rows',
    ]);
    expect(stdout.trim().split('\n')).toEqual(['ok', '50|50']);
  });
});

describe('the edit tool', () => {
  it('holds the file open until it is told to write', async () => {
    const file = join(directory, 'doc');
    await writeFile(file, 'base');
    await writeFile(join(directory, 'content'), 'edited');
    const ready = join(directory, 'ready');
    const go = join(directory, 'go');
    const done = join(directory, 'done');
    const running = background(EDIT_TOOL, [file, join(directory, 'content'), ready, go, done]);
    await until(ready);
    expect(await readFile(file, 'utf8')).toBe('base');
    await writeFile(go, '');
    await running;
    expect(await readFile(file, 'utf8')).toBe('edited');
    expect(existsSync(done)).toBe(true);
  });
});

describe('the writer tool', () => {
  it('logs every file it creates and completes the open file after the go signal', async () => {
    const folder = join(directory, 'dir');
    await execute('mkdir', [folder]);
    const big = Buffer.alloc(100_000, 7);
    await writeFile(join(directory, 'big'), big);
    const ready = join(directory, 'ready');
    const go = join(directory, 'go');
    const stop = join(directory, 'stop');
    const log = join(directory, 'log');
    const running = background(WRITER_TOOL, [folder, join(directory, 'big'), ready, go, stop, log]);
    await until(ready);
    await writeFile(go, '');
    await new Promise((resolve) => setTimeout(resolve, 200));
    await writeFile(stop, '');
    await running;
    const parsed = parseWriterLog(await readFile(log, 'utf8'));
    expect(parsed.created.length).toBeGreaterThanOrEqual(20);
    expect(parsed.refused).toEqual([]);
    expect(await readFile(join(folder, 'open.bin'))).toEqual(big);
    for (const number of parsed.created)
      expect(await readFile(join(folder, `f${String(number)}`), 'utf8')).toBe(
        writerContent(number),
      );
    expect(renamedFolderEntries('dir', parsed, big)).toHaveLength(parsed.created.length + 2);
  });
});

describe('conflictPair', () => {
  it('accepts the original and one conflict copy', () => {
    expect(
      conflictPair(['plan.sync-conflict-20261114-101500-mount.txt', 'plan.txt'], 'plan.txt'),
    ).toEqual({ original: 'plan.txt', conflict: 'plan.sync-conflict-20261114-101500-mount.txt' });
  });

  it('accepts a numbered conflict copy of a file without extension', () => {
    expect(
      conflictPair(['notes', 'notes.sync-conflict-20261114-101500-mount-2'], 'notes').conflict,
    ).toBe('notes.sync-conflict-20261114-101500-mount-2');
  });

  it('rejects a missing original, extra copies and foreign names', () => {
    expect(() =>
      conflictPair(['plan.sync-conflict-20261114-101500-mount.txt'], 'plan.txt'),
    ).toThrow();
    expect(() =>
      conflictPair(
        [
          'plan.txt',
          'plan.sync-conflict-20261114-101500-mount.txt',
          'plan.sync-conflict-20261114-101501-mount.txt',
        ],
        'plan.txt',
      ),
    ).toThrow();
    expect(() => conflictPair(['plan.txt', 'other.txt'], 'plan.txt')).toThrow();
    expect(() => conflictPair(['plan.txt'], 'plan.txt')).toThrow();
  });
});

describe('parseWriterLog', () => {
  it('separates created and refused files', () => {
    expect(parseWriterLog('f0\nf1\n!f2\n')).toEqual({ created: [0, 1], refused: [2] });
  });

  it('rejects a damaged line', () => {
    expect(() => parseWriterLog('oops\n')).toThrow();
  });
});
