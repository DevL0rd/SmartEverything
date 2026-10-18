import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { cachedJson, isMissing, refreshJson } from '../src/fs-util';

const SHAPE = z.object({ name: z.string() });

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fs-util-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('telling a missing file from any other failure', () => {
  it('is true for the error reading a file that is not there', async () => {
    const failure = await readFile(join(directory, 'absent.json')).catch((cause: unknown) => cause);
    expect(isMissing(failure)).toBe(true);
  });

  it('is false for other file errors, plain errors and non-errors', async () => {
    const failure = await readFile(directory).catch((cause: unknown) => cause);
    expect(isMissing(failure)).toBe(false);
    expect(isMissing(new Error('ENOENT'))).toBe(false);
    expect(isMissing('ENOENT')).toBe(false);
    expect(isMissing(null)).toBe(false);
  });
});

describe('a JSON file kept on disk', () => {
  it('reads a stored file without fetching', async () => {
    const file = join(directory, 'stored.json');
    await writeFile(file, JSON.stringify({ name: 'kept' }));
    const fetched: string[] = [];
    const value = await cachedJson(
      file,
      SHAPE,
      () => {
        fetched.push('fetch');
        return Promise.resolve({ name: 'new' });
      },
      () => undefined,
    );
    expect(value).toEqual({ name: 'kept' });
    expect(fetched).toEqual([]);
  });

  it('fetches, validates and stores a file that is not there, without reporting it unreadable', async () => {
    const file = join(directory, 'nested', 'fresh.json');
    const unreadable: unknown[] = [];
    const value = await cachedJson(
      file,
      SHAPE,
      () => Promise.resolve({ name: 'fresh', extra: 1 }),
      (cause) => unreadable.push(cause),
    );
    expect(value).toEqual({ name: 'fresh' });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ name: 'fresh' });
    expect(unreadable).toEqual([]);
  });

  it('reports a damaged file, then fetches and replaces it', async () => {
    const file = join(directory, 'damaged.json');
    await writeFile(file, '{ not json');
    const unreadable: unknown[] = [];
    const value = await cachedJson(
      file,
      SHAPE,
      () => Promise.resolve({ name: 'repaired' }),
      (cause) => unreadable.push(cause),
    );
    expect(value).toEqual({ name: 'repaired' });
    expect(unreadable).toHaveLength(1);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ name: 'repaired' });
  });

  it('reports a stored file of the wrong shape and fetches again', async () => {
    const file = join(directory, 'wrong.json');
    await writeFile(file, JSON.stringify({ name: 3 }));
    const unreadable: unknown[] = [];
    const value = await cachedJson(
      file,
      SHAPE,
      () => Promise.resolve({ name: 'right' }),
      (cause) => unreadable.push(cause),
    );
    expect(value).toEqual({ name: 'right' });
    expect(unreadable).toHaveLength(1);
  });

  it('rejects a fetched body of the wrong shape and stores nothing', async () => {
    const file = join(directory, 'never.json');
    await expect(
      cachedJson(
        file,
        SHAPE,
        () => Promise.resolve({ name: 3 }),
        () => undefined,
      ),
    ).rejects.toThrow();
    await expect(readFile(file)).rejects.toSatisfy(isMissing);
  });

  it('passes a failed fetch through and stores nothing', async () => {
    const file = join(directory, 'offline.json');
    await expect(
      cachedJson(
        file,
        SHAPE,
        () => Promise.reject(new Error('offline')),
        () => undefined,
      ),
    ).rejects.toThrow('offline');
    await expect(readFile(file)).rejects.toSatisfy(isMissing);
  });

  it('refreshes a stored file even when it is readable', async () => {
    const file = join(directory, 'refresh.json');
    await writeFile(file, JSON.stringify({ name: 'old' }));
    const value = await refreshJson(file, SHAPE, () => Promise.resolve({ name: 'new' }));
    expect(value).toEqual({ name: 'new' });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ name: 'new' });
  });
});
