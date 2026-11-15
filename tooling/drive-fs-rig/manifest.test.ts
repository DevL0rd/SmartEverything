import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compare, ok, summary, walk, type Entry } from './manifest.ts';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function file(path: string, sha256: string, size = 3, mode = 0o644): Entry {
  return { path, type: 'file', size, sha256, mode, linkTarget: null };
}

function dir(path: string): Entry {
  return { path, type: 'dir', size: 0, sha256: null, mode: 0o755, linkTarget: null };
}

function link(path: string, target: string): Entry {
  return { path, type: 'link', size: target.length, sha256: null, mode: 0o777, linkTarget: target };
}

const OPTIONS = { modes: false };

describe('compare', () => {
  it('finds nothing wrong when the Hub holds exactly the manifest', () => {
    const entries = [dir('d'), file('d/a', HASH_A), link('l', 'd/a')];
    const report = compare(entries, entries, OPTIONS);
    expect(ok(report)).toBe(true);
    expect(report.checked).toBe(3);
  });

  it('reports a file the Hub does not hold as lost', () => {
    const report = compare([file('a', HASH_A)], [], OPTIONS);
    expect(report.missing).toEqual(['a']);
    expect(ok(report)).toBe(false);
  });

  it('reports a conflict copy and a second copy of the same content as doubled', () => {
    const report = compare(
      [file('a', HASH_A)],
      [file('a', HASH_A), file('a (conflict copy)', HASH_B), file('b', HASH_A)],
      OPTIONS,
    );
    expect(report.doubled).toEqual(['a (conflict copy)', 'b']);
    expect(report.unexpected).toEqual([]);
  });

  it('reports an extra file with new content as unexpected, not doubled', () => {
    const report = compare([file('a', HASH_A)], [file('a', HASH_A), file('z', HASH_B)], OPTIONS);
    expect(report.unexpected).toEqual(['z']);
    expect(report.doubled).toEqual([]);
  });

  it('reports wrong size and wrong content separately', () => {
    const report = compare([file('a', HASH_A, 3)], [file('a', HASH_B, 4)], OPTIONS);
    expect(report.changed.map((difference) => difference.reason)).toEqual([
      `size 4, expected 3`,
      `sha256 ${HASH_B}, expected ${HASH_A}`,
    ]);
  });

  it('reports a type change and a different link target', () => {
    const report = compare(
      [dir('d'), link('l', 'x')],
      [file('d', HASH_A), link('l', 'y')],
      OPTIONS,
    );
    expect(report.changed).toEqual([
      { path: 'd', reason: 'type file, expected dir' },
      { path: 'l', reason: 'link target y, expected x' },
    ]);
  });

  it('compares modes only when asked and ignores the owner read and write bits the Hub forces', () => {
    const expected = [file('a', HASH_A, 3, 0o644)];
    expect(ok(compare(expected, [file('a', HASH_A, 3, 0o755)], OPTIONS))).toBe(true);
    expect(compare(expected, [file('a', HASH_A, 3, 0o755)], { modes: true }).changed).toEqual([
      { path: 'a', reason: 'mode 755, expected 644' },
    ]);
    expect(
      ok(compare([file('a', HASH_A, 3, 0o444)], [file('a', HASH_A, 3, 0o645)], { modes: true })),
    ).toBe(false);
    expect(
      ok(compare([file('a', HASH_A, 3, 0o044)], [file('a', HASH_A, 3, 0o644)], { modes: true })),
    ).toBe(true);
  });
});

describe('summary', () => {
  it('names every problem with its path', () => {
    const report = compare(
      [file('a', HASH_A), file('b', HASH_A)],
      [file('b', HASH_B), file('c', HASH_B)],
      OPTIONS,
    );
    expect(summary(report).split('\n')).toEqual([
      'checked 2 entries: 1 lost, 0 doubled, 1 unexpected, 1 wrong',
      'lost: a',
      'unexpected: c',
      `wrong: b: sha256 ${HASH_B}, expected ${HASH_A}`,
    ]);
  });
});

describe('walk', () => {
  it('records files, folders and links with content hashes in a stable order', async () => {
    const root = await mkdtemp(join('/var/tmp/claude-agents', 'manifest-'));
    try {
      await mkdir(join(root, 'sub'));
      await writeFile(join(root, 'sub', 'f'), 'abc');
      await symlink('sub/f', join(root, 'l'));
      const entries = await walk(root);
      expect(entries.map((entry) => `${entry.type}:${entry.path}`)).toEqual([
        'link:l',
        'dir:sub',
        'file:sub/f',
      ]);
      const hashed = entries.find((entry) => entry.type === 'file');
      expect(hashed?.sha256).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
      expect(entries.find((entry) => entry.type === 'link')?.linkTarget).toBe('sub/f');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
