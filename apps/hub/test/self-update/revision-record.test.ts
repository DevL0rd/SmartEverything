import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UpdateRevision } from '@smarteverything/domain';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { RevisionRecord } from '../../src/self-update/revision-record';

const AT = '2026-11-14T10:00:00.000Z';

let scratch: string;
let record: RevisionRecord;

function revision(n: number, status: UpdateRevision['status'] = 'queued'): UpdateRevision {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    tip: String(n).repeat(40),
    pushedFrom: null,
    base: null,
    status,
    steps: [],
    notes: null,
    failure: null,
    receivedAt: AT,
    updatedAt: AT,
    finishedAt: null,
  };
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'revision-record-'));
  record = new RevisionRecord(join(scratch, 'self-update', 'revisions.json'));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

it('starts empty and keeps revisions in arrival order, replacing one by its id', async () => {
  expect(await record.list()).toEqual([]);
  await record.save(revision(1));
  await record.save(revision(2));
  await record.save(revision(1, 'running'));
  expect((await record.list()).map((entry) => [entry.tip.slice(0, 1), entry.status])).toEqual([
    ['1', 'running'],
    ['2', 'queued'],
  ]);
});

it('keeps every revision when saves overlap', async () => {
  await Promise.all([1, 2, 3, 4, 5, 6].map((n) => record.save(revision(n))));
  expect((await record.list()).map((entry) => entry.tip.slice(0, 1)).sort()).toEqual([
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
  ]);
});

it('writes a private file and leaves no staging file behind', async () => {
  await record.save(revision(1));
  const folder = join(scratch, 'self-update');
  expect(await readdir(folder)).toEqual(['revisions.json']);
  expect((await stat(join(folder, 'revisions.json'))).mode & 0o777).toBe(0o600);
});

it('refuses a record that is not valid rather than discarding it', async () => {
  await record.save(revision(1));
  await writeFile(join(scratch, 'self-update', 'revisions.json'), '{"revisions":[{"id":"x"}]}');
  await expect(record.list()).rejects.toThrow();
  await expect(record.save(revision(2))).rejects.toThrow();
  expect(await readFile(join(scratch, 'self-update', 'revisions.json'), 'utf8')).toContain('"x"');
});
