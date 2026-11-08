import { lstat, mkdir, mkdtemp, opendir, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { areaOf } from '../../../src/data-layout/move/areas';
import { countPrefix, hashAndScan, PrefixCounter } from '../../../src/data-layout/move/prefix-scan';
import { walkHubEntries, type WalkOperations } from '../../../src/data-layout/move/walk';

const PREFIX = '/home/me/.config/SmartEverything';
let work: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'move-scan-'));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

describe('prefix counter', () => {
  it('counts hits followed by a path separator or the end', () => {
    expect(countPrefix(`${PREFIX}/system and ${PREFIX}`, PREFIX)).toBe(2);
  });

  it('ignores a longer sibling name', () => {
    expect(countPrefix(`${PREFIX}-Hub/x ${PREFIX}2 ${PREFIX}é`, PREFIX)).toBe(0);
  });

  it('finds a hit that crosses every chunk boundary', () => {
    const text = Buffer.from(`xx${PREFIX}/data yy`, 'utf8');
    for (let cut = 1; cut < text.length; cut += 1) {
      const counter = new PrefixCounter(PREFIX);
      counter.push(text.subarray(0, cut));
      counter.push(text.subarray(cut));
      expect(counter.finish()).toBe(1);
    }
  });

  it('finds a hit fed one byte at a time and does not double count', () => {
    const text = Buffer.from(`${PREFIX}/a ${PREFIX}/b`, 'utf8');
    const counter = new PrefixCounter(PREFIX);
    for (const byte of text) {
      counter.push(Buffer.from([byte]));
    }
    expect(counter.finish()).toBe(2);
  });

  it('rejects an empty prefix', () => {
    expect(() => new PrefixCounter('')).toThrow();
  });

  it('hashes and finds the prefix inside a SQLite file', async () => {
    const file = join(work, 'store.db');
    const database = new DatabaseSync(file);
    database.exec('CREATE TABLE settings (key TEXT, value TEXT)');
    database.prepare('INSERT INTO settings VALUES (?, ?)').run('dir', `${PREFIX}/drive`);
    database.close();
    const scan = await hashAndScan(file, PREFIX);
    expect(scan.prefixHits).toBe(1);
    expect(scan.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('finds a hit that straddles the one megabyte read boundary of a file', async () => {
    const chunk = 1024 * 1024;
    const lead = Buffer.alloc(chunk - 10, 0x2e);
    const file = join(work, 'big.bin');
    await writeFile(
      file,
      Buffer.concat([lead, Buffer.from(`${PREFIX}/x`), Buffer.alloc(100, 0x2e)]),
    );
    const scan = await hashAndScan(file, PREFIX);
    expect(scan.prefixHits).toBe(1);
    expect(scan.bytes).toBe(chunk - 10 + PREFIX.length + 2 + 100);
  });
});

describe('areas', () => {
  it('maps hub areas and skips the database, tmp and unknown entries', () => {
    expect(areaOf('people/p1/drive/a.txt')).toBe('people');
    expect(areaOf('home')).toBe('home');
    expect(areaOf('system/keys/secret.key')).toBe('system');
    expect(areaOf('cache/harness')).toBe('cache');
    expect(areaOf('backups/manual')).toBe('backups');
    expect(areaOf('system/database/smarteverything.db')).toBeUndefined();
    expect(areaOf('tmp/x')).toBeUndefined();
    expect(areaOf('layout.json')).toBeUndefined();
    expect(areaOf('foreign.txt')).toBeUndefined();
  });
});

describe('walk', () => {
  it('yields only hub entries and directories after their children', async () => {
    await mkdir(join(work, 'people/p1'), { recursive: true });
    await mkdir(join(work, 'system/database'), { recursive: true });
    await mkdir(join(work, 'tmp'), { recursive: true });
    await writeFile(join(work, 'people/p1/a.txt'), 'a');
    await writeFile(join(work, 'system/database/x.db'), 'db');
    await writeFile(join(work, 'tmp/scratch'), 'x');
    await writeFile(join(work, 'foreign.txt'), 'x');
    const seen: string[] = [];
    for await (const entry of walkHubEntries(work)) {
      seen.push(`${entry.kind}:${entry.relPath}`);
    }
    expect([...seen].sort()).toEqual([
      'directory:people',
      'directory:people/p1',
      'directory:system',
      'file:people/p1/a.txt',
    ]);
    const at = (item: string): number => seen.indexOf(item);
    expect(at('file:people/p1/a.txt')).toBeLessThan(at('directory:people/p1'));
    expect(at('directory:people/p1')).toBeLessThan(at('directory:people'));
  });

  it('keeps no list of entries while walking many tiny files', async () => {
    const folder = join(work, 'people/p1');
    await mkdir(folder, { recursive: true });
    const total = 20_000;
    for (let start = 0; start < total; start += 500) {
      await Promise.all(
        Array.from({ length: 500 }, (_, offset) =>
          writeFile(join(folder, `f${String(start + offset)}`), ''),
        ),
      );
    }
    let opened = 0;
    let files = 0;
    const operations: WalkOperations = {
      lstat,
      opendir: (path) => {
        opened += 1;
        return opendir(path);
      },
    };
    for await (const entry of walkHubEntries(work, operations)) {
      if (entry.kind === 'file') {
        files += 1;
      }
    }
    expect(files).toBe(total);
    expect(opened).toBe(3);
  }, 60_000);
});
