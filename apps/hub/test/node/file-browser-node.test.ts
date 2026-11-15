import type { FileSearchHit, FileSearchResult } from '@smarteverything/domain';
import { EventEmitter } from 'node:events';
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZipFile } from 'yauzl';
import { FolderWatch } from '../../src/node/controls/folder-watch';
import { HomeFiles } from '../../src/node/controls/home-files';
import { TrashBins } from '../../src/node/controls/linux/file-trash';
import { FileScope } from '../../src/node/controls/linux/file-scope';
import { FileSearch } from '../../src/node/controls/linux/file-search';
import { FileWriter } from '../../src/node/controls/linux/file-write';
import { XdgTrash } from '../../src/node/controls/linux/trash';
import { ZipEntries } from '../../src/node/controls/zip-entries';
import { zipChunks, type ZipEntry } from '../../src/zip/zip-stream';

const UID = 1000;
const NOW = new Date('2026-10-17T10:00:00Z');

let root: string;
let home: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'se-fb02-'));
  home = join(root, 'home');
  await mkdir(home);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(path: string, content = 'x'): Promise<string> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
  return path;
}

describe('file listing with mime and sort', () => {
  it('reports a mime on files and none on folders or unknown types', async () => {
    await put(join(home, 'a.png'));
    await put(join(home, 'b.unknownext'));
    await mkdir(join(home, 'dir.zip'));
    const list = await new HomeFiles(home).list(null, 0);
    expect(list.entries.map((entry) => [entry.name, entry.mime])).toEqual([
      ['dir.zip', null],
      ['a.png', 'image/png'],
      ['b.unknownext', null],
    ]);
  });

  it('sorts folders first and names in natural order, both ways', async () => {
    for (const name of ['file10.txt', 'file2.txt', 'File1.txt']) await put(join(home, name));
    await mkdir(join(home, 'zeta'));
    await mkdir(join(home, 'alpha'));
    const files = new HomeFiles(home);
    const asc = await files.list(null, 0, { field: 'name', direction: 'asc' });
    expect(asc.entries.map((entry) => entry.name)).toEqual([
      'alpha',
      'zeta',
      'File1.txt',
      'file2.txt',
      'file10.txt',
    ]);
    const desc = await files.list(null, 0, { field: 'name', direction: 'desc' });
    expect(desc.entries.map((entry) => entry.name)).toEqual([
      'zeta',
      'alpha',
      'file10.txt',
      'file2.txt',
      'File1.txt',
    ]);
  });

  it('sorts by size and by modified time before paging', async () => {
    await put(join(home, 'small.txt'), 'a');
    await put(join(home, 'big.txt'), 'aaaaaaaa');
    await put(join(home, 'mid.txt'), 'aaaa');
    await mkdir(join(home, 'folder'));
    await utimes(join(home, 'small.txt'), 3000, 3000);
    await utimes(join(home, 'big.txt'), 1000, 1000);
    await utimes(join(home, 'mid.txt'), 2000, 2000);
    const files = new HomeFiles(home);
    const bySize = await files.list(null, 0, { field: 'size', direction: 'desc' });
    expect(bySize.entries.map((entry) => entry.name)).toEqual([
      'folder',
      'big.txt',
      'mid.txt',
      'small.txt',
    ]);
    const byTime = await files.list(null, 0, { field: 'modifiedAt', direction: 'asc' });
    expect(byTime.entries.map((entry) => entry.name)).toEqual([
      'folder',
      'big.txt',
      'mid.txt',
      'small.txt',
    ]);
  });

  it('keeps one global order across pages', async () => {
    for (let index = 0; index < 620; index += 1) {
      await put(join(home, `n${String(index).padStart(4, '0')}.txt`), 'x'.repeat(index));
    }
    const files = new HomeFiles(home);
    const sort = { field: 'size', direction: 'desc' } as const;
    const first = await files.list(null, 0, sort);
    const second = await files.list(null, first.next ?? 0, sort);
    expect(first.next).toBe(500);
    expect(second.next).toBeNull();
    const sizes = [...first.entries, ...second.entries].map((entry) => entry.size);
    expect(sizes).toHaveLength(620);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });
});

describe('Trash listing, restore and delete forever', () => {
  function bins(mounts: string): { trash: XdgTrash; bins: TrashBins; writer: FileWriter } {
    const trash = new XdgTrash(join(root, 'data'), (): Date => NOW);
    const all = new TrashBins(trash, { mounts, uid: UID, now: (): Date => NOW });
    return { trash, bins: all, writer: new FileWriter(new FileScope([home, trash.root]), all) };
  }

  async function drive(name: string): Promise<string> {
    const mount = join(root, name);
    const bin = join(mount, `.Trash-${String(UID)}`);
    await mkdir(join(bin, 'files'), { recursive: true });
    await mkdir(join(bin, 'info'), { recursive: true });
    return mount;
  }

  async function mountsFile(...mounts: string[]): Promise<string> {
    const file = join(root, 'mounts');
    await writeFile(file, mounts.map((mount) => `/dev/sdb1 ${mount} ext4 rw 0 0`).join('\n'));
    return file;
  }

  it('lists the home Trash newest first with original path, size and kind', async () => {
    const { writer, bins: all } = bins(await mountsFile());
    const a = await put(join(home, 'docs', 'a.txt'), 'hello');
    await put(join(home, 'dir', 'f.txt'), '12345678');
    await writer.write({ action: 'trash', paths: [a] });
    await writer.write({ action: 'trash', paths: [join(home, 'dir')] });
    const list = await all.list(0);
    expect(list.total).toBe(2);
    expect(list.next).toBeNull();
    expect(list.entries.map((entry) => [entry.trashId, entry.name, entry.originalPath])).toEqual(
      expect.arrayContaining([
        ['a.txt', 'a.txt', a],
        ['dir', 'dir', join(home, 'dir')],
      ]),
    );
    expect(list.entries.find((entry) => entry.trashId === 'a.txt')).toMatchObject({
      size: 5,
      kind: 'file',
    });
    expect(list.entries.find((entry) => entry.trashId === 'dir')).toMatchObject({
      size: 8,
      kind: 'folder',
    });
  });

  it('reads percent-decoded paths and the recorded local deletion time', async () => {
    const { trash, bins: all } = bins(await mountsFile());
    await mkdir(join(trash.root, 'files'), { recursive: true });
    await mkdir(join(trash.root, 'info'), { recursive: true });
    await writeFile(join(trash.root, 'files', 'a b.txt'), 'x');
    await writeFile(
      join(trash.root, 'info', 'a b.txt.trashinfo'),
      '[Trash Info]\nPath=/home/u/my%20docs/a%20b.txt\nDeletionDate=2026-03-04T05:06:07\n',
    );
    const [entry] = (await all.list(0)).entries;
    expect(entry?.originalPath).toBe('/home/u/my docs/a b.txt');
    expect(entry?.deletedAt).toBe(new Date(2026, 2, 4, 5, 6, 7).toISOString());
  });

  it('includes a drive Trash and restores and deletes from it by its id', async () => {
    const mount = await drive('stick');
    const { bins: all } = bins(await mountsFile(mount));
    const bin = join(mount, `.Trash-${String(UID)}`);
    await writeFile(join(bin, 'files', 'song.mp3'), 'tune');
    await writeFile(
      join(bin, 'info', 'song.mp3.trashinfo'),
      '[Trash Info]\nPath=music/song.mp3\nDeletionDate=2026-03-04T05:06:07\n',
    );
    await writeFile(join(bin, 'files', 'junk.bin'), 'zz');
    await writeFile(
      join(bin, 'info', 'junk.bin.trashinfo'),
      `[Trash Info]\nPath=${mount}/junk.bin\nDeletionDate=2026-03-04T05:06:08\n`,
    );
    const listed = (await all.list(0)).entries;
    const song = listed.find((entry) => entry.name === 'song.mp3');
    expect(song).toMatchObject({
      trashId: `${bin}/song.mp3`,
      originalPath: join(mount, 'music', 'song.mp3'),
    });
    expect(await all.restore(`${bin}/song.mp3`)).toBe(join(mount, 'music', 'song.mp3'));
    expect(await readFile(join(mount, 'music', 'song.mp3'), 'utf8')).toBe('tune');
    expect(await all.purge(`${bin}/junk.bin`)).toBe(join(mount, 'junk.bin'));
    expect(await readdir(join(bin, 'files'))).toEqual([]);
    expect(await readdir(join(bin, 'info'))).toEqual([]);
  });

  it('refuses a trash id that names a folder that is not a known Trash', async () => {
    const { bins: all } = bins(await mountsFile());
    await expect(all.purge('/etc/passwd')).rejects.toMatchObject({ code: 'not_found' });
    await expect(all.restore('/nowhere/x')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('deletes forever through the write action and reports the original path', async () => {
    const { writer, trash } = bins(await mountsFile());
    const a = await put(join(home, 'gone.txt'));
    const id = (await writer.write({ action: 'trash', paths: [a] })).done[0]?.trashId ?? '';
    const result = await writer.write({ action: 'delete_now', items: [id] });
    expect(result.done).toEqual([{ path: a, newPath: null, trashId: id }]);
    expect(await readdir(join(trash.root, 'files'))).toEqual([]);
    expect(await readdir(join(trash.root, 'info'))).toEqual([]);
    const again = await writer.write({ action: 'delete_now', items: [id] });
    expect(again.failed[0]?.reason).toContain('not in the Trash');
  });

  it('pages the listing', async () => {
    const { writer, bins: all } = bins(await mountsFile());
    for (let index = 0; index < 510; index += 1) {
      await put(join(home, `f${String(index)}.txt`));
    }
    await writer.write({
      action: 'trash',
      paths: Array.from({ length: 510 }, (_, index) => join(home, `f${String(index)}.txt`)),
    });
    const first = await all.list(0);
    const second = await all.list(first.next ?? 0);
    expect(first.entries).toHaveLength(500);
    expect(second.entries).toHaveLength(10);
    expect(first.total).toBe(510);
  });
});

describe('zip contents', () => {
  async function zipOf(entries: ZipEntry[], threshold = 0xf0000000): Promise<string> {
    const parts: Buffer[] = [];
    for await (const part of zipChunks(entries, threshold)) parts.push(part);
    const file = join(root, 'a.zip');
    await writeFile(file, Buffer.concat(parts));
    return file;
  }

  async function sample(compress: boolean, threshold?: number): Promise<string> {
    const big = await put(join(root, 'big.bin'), 'abcdefghij'.repeat(1000));
    return zipOf(
      [
        { kind: 'folder', name: 'docs/', mtime: NOW, mode: 0o40755 },
        {
          kind: 'file',
          name: 'docs/big.bin',
          source: big,
          size: 10_000,
          mtime: NOW,
          mode: 0o100644,
          compress,
        },
        { kind: 'text', name: 'photo.png', text: 'png', mtime: NOW },
      ],
      threshold,
    );
  }

  it('lists a stored archive in its own order with totals', async () => {
    const page = await new ZipEntries().list(await sample(false), null);
    expect(page.next).toBeNull();
    expect(page.items.map((entry) => [entry.index, entry.path, entry.kind, entry.bytes])).toEqual([
      [0, 'docs', 'folder', 0],
      [1, 'docs/big.bin', 'other', 10_000],
      [2, 'photo.png', 'image', 3],
    ]);
    expect(page.totals).toMatchObject({ files: 2, folders: 1, bytes: 10_003 });
  });

  it('lists a deflated archive and reads ranges of stored and deflated entries', async () => {
    const zip = new ZipEntries();
    for (const compress of [false, true]) {
      const file = await sample(compress);
      const page = await zip.list(file, null);
      expect(page.items[1]?.compressedBytes === 10_000).toBe(!compress);
      const range = await zip.range(file, 1, 2500, 20);
      expect(Buffer.from(range.data, 'base64').toString()).toBe('abcdefghijabcdefghij');
      expect(range.size).toBe(10_000);
      expect(range.name).toBe('big.bin');
      const tail = await zip.range(file, 1, 9_995, 100);
      expect(Buffer.from(tail.data, 'base64').toString()).toBe('fghij');
    }
  });

  it('inflates a deflated entry once while it is read in sequential ranges', async () => {
    const content = Buffer.from('0123456789abcdef'.repeat(200_000));
    const big = join(root, 'large.bin');
    await writeFile(big, content);
    const file = await zipOf([
      {
        kind: 'file',
        name: 'large.bin',
        source: big,
        size: content.length,
        mtime: NOW,
        mode: 0o100644,
        compress: true,
      },
    ]);
    const opened = vi.spyOn(ZipFile.prototype, 'openReadStream');
    try {
      const zip = new ZipEntries();
      const piece = 1_000_000;
      const parts: Buffer[] = [];
      for (let start = 0; start < content.length; start += piece) {
        const range = await zip.range(file, 0, start, piece);
        parts.push(Buffer.from(range.data, 'base64'));
      }
      expect(Buffer.concat(parts).equals(content)).toBe(true);
      expect(opened).toHaveBeenCalledTimes(1);
      const again = await zip.range(file, 0, 5, 10);
      expect(Buffer.from(again.data, 'base64').toString()).toBe('56789abcde');
      expect(opened).toHaveBeenCalledTimes(2);
    } finally {
      opened.mockRestore();
    }
  });

  it('skips ahead and seeks back inside a deflated entry', async () => {
    const content = Buffer.from('0123456789abcdef'.repeat(50_000));
    const big = join(root, 'large.bin');
    await writeFile(big, content);
    const file = await zipOf([
      {
        kind: 'file',
        name: 'large.bin',
        source: big,
        size: content.length,
        mtime: NOW,
        mode: 0o100644,
        compress: true,
      },
    ]);
    const zip = new ZipEntries();
    const ahead = await zip.range(file, 0, 700_000, 20);
    expect(Buffer.from(ahead.data, 'base64').toString()).toBe(
      content.subarray(700_000, 700_020).toString(),
    );
    const back = await zip.range(file, 0, 3, 5);
    expect(Buffer.from(back.data, 'base64').toString()).toBe('34567');
  });

  it('reads the 64-bit form', async () => {
    const zip = new ZipEntries();
    const file = await sample(true, 1000);
    const page = await zip.list(file, null);
    expect(page.items).toHaveLength(3);
    const range = await zip.range(file, 2, 0, 10);
    expect(Buffer.from(range.data, 'base64').toString()).toBe('png');
  });

  it('flags encrypted entries and refuses to read them', async () => {
    const file = await sample(false);
    const bytes = await readFile(file);
    for (let at = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); at !== -1;) {
      bytes.writeUInt16LE(bytes.readUInt16LE(at + 8) | 1, at + 8);
      at = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), at + 4);
    }
    await writeFile(file, bytes);
    const zip = new ZipEntries();
    const page = await zip.list(file, null);
    expect(page.items.map((entry) => entry.encrypted)).toEqual([true, true, true]);
    await expect(zip.range(file, 1, 0, 10)).rejects.toMatchObject({ code: 'not_supported' });
  });

  it('answers folders, missing entries and non archives with failures', async () => {
    const zip = new ZipEntries();
    const file = await sample(false);
    await expect(zip.range(file, 0, 0, 1)).rejects.toMatchObject({ code: 'not_supported' });
    await expect(zip.range(file, 99, 0, 1)).rejects.toMatchObject({ code: 'not_found' });
    const plain = await put(join(root, 'plain.zip'), 'not a zip');
    await expect(zip.list(plain, null)).rejects.toMatchObject({ code: 'failed' });
    await expect(zip.list(join(root, 'missing.zip'), null)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('pages a large archive with a cursor', async () => {
    const entries: ZipEntry[] = Array.from({ length: 620 }, (_, index) => ({
      kind: 'text',
      name: `f${String(index)}.txt`,
      text: 'x',
      mtime: NOW,
    }));
    const file = await zipOf(entries);
    const zip = new ZipEntries();
    const first = await zip.list(file, null);
    expect(first.items).toHaveLength(500);
    expect(first.next).toBe('500');
    const second = await zip.list(file, first.next);
    expect(second.items).toHaveLength(120);
    expect(second.next).toBeNull();
    expect(second.totals.files).toBe(620);
  });
});

describe('content search', () => {
  function search(): FileSearch {
    let tick = 0;
    return new FileSearch(new FileScope([home]), {
      now: (): number => {
        tick += 1;
        return tick;
      },
      newId: (): string => 'walk',
    });
  }

  async function run(text: string, contents: boolean): Promise<readonly FileSearchHit[]> {
    const result = await search().search({ path: home, text, contents, cursor: null });
    return result.matches.map((match) => match.hit);
  }

  it('returns the line, a snippet and every range for a text hit', async () => {
    await put(join(home, 'notes.txt'), 'first line\nthe Needle is here and a needle again\nlast');
    const result = await search().search({
      path: home,
      text: 'needle',
      contents: true,
      cursor: null,
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.hit).toEqual({
      kind: 'text',
      snippet: 'the Needle is here and a needle again',
      line: 2,
      ranges: [
        { start: 4, end: 10 },
        { start: 25, end: 31 },
      ],
    });
  });

  it('does not read contents unless asked and still matches names', async () => {
    await put(join(home, 'notes.txt'), 'a needle');
    await put(join(home, 'needle.md'), 'nothing');
    expect(await run('needle', false)).toEqual([
      { kind: 'name', snippet: 'needle.md', line: null, ranges: [{ start: 0, end: 6 }] },
    ]);
    const kinds = (await run('needle', true)).map((hit) => hit.kind).sort();
    expect(kinds).toEqual(['name', 'text']);
  });

  it('skips binary files and non-text types', async () => {
    await writeFile(join(home, 'blob.dat'), Buffer.from('needle\0needle'));
    await put(join(home, 'photo.png'), 'needle');
    await put(join(home, 'sub', 'deep.log'), 'x\nneedle');
    const hits = await run('needle', true);
    expect(hits).toEqual([
      { kind: 'text', snippet: 'needle', line: 2, ranges: [{ start: 0, end: 6 }] },
    ]);
  });

  it('keeps long lines to a window around the match', async () => {
    await put(join(home, 'wide.txt'), `${'a'.repeat(500)}needle${'b'.repeat(500)}`);
    const [hit] = await run('needle', true);
    expect(hit?.snippet.length).toBeLessThan(200);
    expect(hit?.ranges).toHaveLength(1);
    const range = hit?.ranges[0];
    expect(hit?.snippet.slice(range?.start, range?.end)).toBe('needle');
  });

  it('finds a hit that spans a chunk boundary and on the last line without a newline', async () => {
    await put(join(home, 'big.txt'), `${'line\n'.repeat(40_000)}needle at the end`);
    const [hit] = await run('needle', true);
    expect(hit).toMatchObject({ kind: 'text', line: 40_001 });
  });
});

describe('content search on huge lines', () => {
  it('scans a file with no newline in bounded memory and finds a late match', async () => {
    const block = 'abcdefghij'.repeat(100_000);
    const target = join(home, 'bundle.json');
    const handle = await open(target, 'w');
    for (let index = 0; index < 40; index += 1) {
      await handle.write(block);
    }
    await handle.write('tail NEEDLE here');
    await handle.close();
    const before = process.memoryUsage().rss;
    const started = Date.now();
    const search = new FileSearch(new FileScope([home]));
    let hit: FileSearchHit | undefined;
    let cursor: string | null = null;
    do {
      const result: FileSearchResult = await search.search({
        path: home,
        text: 'needle',
        contents: true,
        cursor,
      });
      hit ??= result.matches[0]?.hit;
      cursor = result.next;
    } while (cursor !== null);
    expect(hit).toMatchObject({ kind: 'text', line: 1 });
    expect(hit?.snippet.endsWith('tail NEEDLE here')).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(process.memoryUsage().rss - before).toBeLessThan(150_000_000);
  });

  it('resumes a long file on the next page when the scan budget runs out', async () => {
    await put(join(home, 'big.txt'), `${'line\n'.repeat(400_000)}needle at the end`);
    let tick = 0;
    const search = new FileSearch(new FileScope([home]), {
      now: (): number => {
        tick += 400;
        return tick;
      },
      newId: (): string => 'walk',
    });
    let pages = 0;
    let hit: FileSearchHit | undefined;
    let cursor: string | null = null;
    do {
      const result: FileSearchResult = await search.search({
        path: home,
        text: 'needle',
        contents: true,
        cursor,
      });
      pages += 1;
      hit ??= result.matches[0]?.hit;
      cursor = result.next;
    } while (cursor !== null);
    expect(pages).toBeGreaterThan(1);
    expect(hit).toMatchObject({ kind: 'text', line: 400_001 });
  });
});

describe('folder watch', () => {
  class FakeWatcher extends EventEmitter {
    closed = false;

    close(): void {
      this.closed = true;
    }
  }

  interface Rig {
    readonly watch: FolderWatch;
    readonly watchers: Map<string, { watcher: FakeWatcher; fire: () => void }>;
    readonly reported: string[];
    readonly failures: string[];
    readonly timers: (() => void)[];
  }

  function rig(): Rig {
    const watchers = new Map<string, { watcher: FakeWatcher; fire: () => void }>();
    const reported: string[] = [];
    const failures: string[] = [];
    const timers: (() => void)[] = [];
    const watch = new FolderWatch({
      changed: (path): void => {
        reported.push(path);
      },
      failed: (path): void => {
        failures.push(path);
      },
      watch: (path, onEvent): FakeWatcher => {
        const watcher = new FakeWatcher();
        watchers.set(path, { watcher, fire: onEvent });
        return watcher;
      },
      schedule: (work): (() => void) => {
        timers.push(work);
        return (): void => {
          timers.splice(timers.indexOf(work), 1);
        };
      },
    });
    return { watch, watchers, reported, failures, timers };
  }

  it('starts on demand, coalesces a burst into one report and stops when demand drops', () => {
    const { watch, watchers, reported, timers } = rig();
    watch.sync(['/a', '/b']);
    expect([...watchers.keys()]).toEqual(['/a', '/b']);
    const a = watchers.get('/a');
    a?.fire();
    a?.fire();
    a?.fire();
    expect(timers).toHaveLength(1);
    expect(reported).toEqual([]);
    timers.shift()?.();
    expect(reported).toEqual(['/a']);
    a?.fire();
    timers.shift()?.();
    expect(reported).toEqual(['/a', '/a']);
    watch.sync(['/b']);
    expect(a?.watcher.closed).toBe(true);
    expect(watchers.get('/b')?.watcher.closed).toBe(false);
    watch.sync([]);
    expect(watchers.get('/b')?.watcher.closed).toBe(true);
  });

  it('cancels a pending report when the demand drops first', () => {
    const { watch, watchers, reported, timers } = rig();
    watch.sync(['/a']);
    watchers.get('/a')?.fire();
    watch.sync([]);
    expect(timers).toHaveLength(0);
    expect(reported).toEqual([]);
  });

  it('does not restart a watcher that is already running', () => {
    const { watch, watchers } = rig();
    watch.sync(['/a']);
    const first = watchers.get('/a')?.watcher;
    watch.sync(['/a']);
    expect(watchers.get('/a')?.watcher).toBe(first);
  });

  it('reports and drops a watcher that fails, and can start it again', () => {
    const { watch, watchers, reported, failures } = rig();
    watch.sync(['/a']);
    watchers.get('/a')?.watcher.emit('error', new Error('gone'));
    expect(failures).toEqual(['/a']);
    expect(reported).toEqual(['/a']);
    expect(watchers.get('/a')?.watcher.closed).toBe(true);
    watch.sync(['/a']);
    expect(watchers.get('/a')?.watcher.closed).toBe(false);
  });

  it('reports a real change in a real folder', async () => {
    const reported: string[] = [];
    const seen = new Promise<void>((resolve) => {
      const real = new FolderWatch({
        changed: (path): void => {
          reported.push(path);
          real.stop();
          resolve();
        },
        failed: (): void => undefined,
        debounceMs: 20,
      });
      real.sync([home]);
      void writeFile(join(home, 'new.txt'), 'x');
    });
    await seen;
    expect(reported).toEqual([home]);
    expect((await stat(join(home, 'new.txt'))).isFile()).toBe(true);
  });
});
