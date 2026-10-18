import type { FileWriteChange } from '@smarteverything/domain';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilePropertiesReader } from '../../src/node/controls/linux/file-properties';
import { FileScope } from '../../src/node/controls/linux/file-scope';
import { FileSearch, type SearchClock } from '../../src/node/controls/linux/file-search';
import { FileUploads } from '../../src/node/controls/linux/file-upload';
import { FileWriter } from '../../src/node/controls/linux/file-write';
import { XdgTrash } from '../../src/node/controls/linux/trash';

const NOW = new Date('2026-10-17T10:00:00Z');

interface World {
  readonly root: string;
  readonly home: string;
  readonly scope: FileScope;
  readonly writer: FileWriter;
  readonly trash: XdgTrash;
}

let world: World;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'se-files-'));
  const home = join(root, 'home');
  await mkdir(home);
  const trash = new XdgTrash(join(root, 'data'), () => NOW);
  const scope = new FileScope([home, trash.root]);
  world = { root, home, scope, writer: new FileWriter(scope, trash), trash };
});

afterEach(async () => {
  await rm(world.root, { recursive: true, force: true });
});

async function file(path: string, content = 'x'): Promise<string> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
  return path;
}

function write(change: FileWriteChange): ReturnType<FileWriter['write']> {
  return world.writer.write(change);
}

describe('path safety', () => {
  it.each(['relative/path', '/a/../etc', '/a/./b', '/a//b', '/a\0b'])(
    'refuses the path %j',
    async (path) => {
      await expect(write({ action: 'new_folder', path })).resolves.toMatchObject({
        done: [],
        failed: [{ reason: 'That path is not allowed.' }],
      });
    },
  );

  it('refuses to change the top of the drive, the home folder and the Trash', async () => {
    expect((await write({ action: 'trash', paths: [world.home] })).failed[0]?.reason).toContain(
      'protected',
    );
    expect((await write({ action: 'rename', path: world.home, name: 'x' })).failed).toHaveLength(1);
    await world.trash.put(await file(join(world.home, 'a.txt')));
    expect(
      (await write({ action: 'trash', paths: [world.trash.root] })).failed[0]?.reason,
    ).toContain('protected');
    expect((await write({ action: 'new_folder', path: '/' })).failed).toHaveLength(1);
  });

  it('moves a symlink itself and never what it points at', async () => {
    const outside = await file(join(world.root, 'outside', 'secret.txt'), 'secret');
    await symlink(outside, join(world.home, 'link'));
    await mkdir(join(world.home, 'dest'));
    const result = await write({
      action: 'move',
      paths: [join(world.home, 'link')],
      to: join(world.home, 'dest'),
      replace: false,
    });
    expect(result.failed).toEqual([]);
    expect(await readlink(join(world.home, 'dest', 'link'))).toBe(outside);
    expect(await readFile(outside, 'utf8')).toBe('secret');
  });

  it('copies a symlink as a symlink instead of reading through it', async () => {
    const outside = await file(join(world.root, 'outside', 'secret.txt'));
    await symlink(outside, join(world.home, 'link'));
    await mkdir(join(world.home, 'dest'));
    await write({
      action: 'copy',
      paths: [join(world.home, 'link')],
      to: join(world.home, 'dest'),
      replace: false,
    });
    expect((await lstat(join(world.home, 'dest', 'link'))).isSymbolicLink()).toBe(true);
  });

  it('does not write through a symlink when replacing it', async () => {
    const outside = await file(join(world.root, 'outside', 'secret.txt'), 'secret');
    await symlink(outside, join(world.home, 'doc'));
    const uploads = new FileUploads(world.scope);
    await uploads.receive({
      path: join(world.home, 'doc'),
      start: 0,
      data: Buffer.from('new').toString('base64'),
      final: true,
      replace: true,
    });
    expect(await readFile(outside, 'utf8')).toBe('secret');
    expect(await readFile(join(world.home, 'doc'), 'utf8')).toBe('new');
  });
});

describe('writing files', () => {
  it('makes a folder only where the parent exists and the name is free', async () => {
    const path = join(world.home, 'New');
    expect((await write({ action: 'new_folder', path })).done).toEqual([
      { path, newPath: path, trashId: null },
    ]);
    expect((await write({ action: 'new_folder', path })).failed[0]?.reason).toContain(
      'already there',
    );
    expect(
      (await write({ action: 'new_folder', path: join(world.home, 'no', 'deeper') })).failed[0]
        ?.reason,
    ).toContain('does not exist');
  });

  it('renames within the folder and refuses names that are taken', async () => {
    const a = await file(join(world.home, 'a.txt'));
    await file(join(world.home, 'b.txt'));
    expect((await write({ action: 'rename', path: a, name: 'b.txt' })).failed).toHaveLength(1);
    expect((await write({ action: 'rename', path: a, name: '..' })).failed).toHaveLength(1);
    expect((await write({ action: 'rename', path: a, name: 'c.txt' })).done[0]?.newPath).toBe(
      join(world.home, 'c.txt'),
    );
  });

  it('keeps going after one item fails and reports each', async () => {
    const a = await file(join(world.home, 'a.txt'));
    await mkdir(join(world.home, 'dest'));
    const result = await write({
      action: 'move',
      paths: [join(world.home, 'missing'), a],
      to: join(world.home, 'dest'),
      replace: false,
    });
    expect(result.done.map((item) => item.newPath)).toEqual([join(world.home, 'dest', 'a.txt')]);
    expect(result.failed).toEqual([
      { path: join(world.home, 'missing'), reason: 'That file or folder does not exist.' },
    ]);
  });

  it('replaces a file only when asked and never a folder', async () => {
    const a = await file(join(world.home, 'a.txt'), 'new');
    await file(join(world.home, 'dest', 'a.txt'), 'old');
    await mkdir(join(world.home, 'b'));
    await mkdir(join(world.home, 'dest', 'b'));
    const to = join(world.home, 'dest');
    expect((await write({ action: 'copy', paths: [a], to, replace: false })).failed).toHaveLength(
      1,
    );
    expect(await readFile(join(to, 'a.txt'), 'utf8')).toBe('old');
    expect((await write({ action: 'copy', paths: [a], to, replace: true })).done).toHaveLength(1);
    expect(await readFile(join(to, 'a.txt'), 'utf8')).toBe('new');
    expect(
      (await write({ action: 'move', paths: [join(world.home, 'b')], to, replace: true })).failed[0]
        ?.reason,
    ).toContain('Only files');
  });

  it('copies folders with their contents and keeps the original', async () => {
    await file(join(world.home, 'src', 'deep', 'f.txt'), 'content');
    await mkdir(join(world.home, 'dest'));
    await write({
      action: 'copy',
      paths: [join(world.home, 'src')],
      to: join(world.home, 'dest'),
      replace: false,
    });
    expect(await readFile(join(world.home, 'dest', 'src', 'deep', 'f.txt'), 'utf8')).toBe(
      'content',
    );
    expect(await readdir(join(world.home, 'src'))).toEqual(['deep']);
  });

  it('refuses to put a folder inside itself or move onto its own place', async () => {
    await mkdir(join(world.home, 'a', 'b'), { recursive: true });
    const inside = await write({
      action: 'move',
      paths: [join(world.home, 'a')],
      to: join(world.home, 'a', 'b'),
      replace: false,
    });
    expect(inside.failed[0]?.reason).toContain('inside itself');
    const same = await write({
      action: 'move',
      paths: [join(world.home, 'a')],
      to: world.home,
      replace: false,
    });
    expect(same.failed[0]?.reason).toContain('already in this folder');
    expect((await lstat(join(world.home, 'a', 'b'))).isDirectory()).toBe(true);
  });

  it('refuses a destination that is not a folder', async () => {
    const a = await file(join(world.home, 'a.txt'));
    const b = await file(join(world.home, 'b.txt'));
    expect(
      (await write({ action: 'move', paths: [a], to: b, replace: false })).failed[0]?.reason,
    ).toContain('not a folder');
  });
});

describe('Trash', () => {
  it('trashes with the Trash spec layout and restores to the same place', async () => {
    const a = await file(join(world.home, 'docs', 'a.txt'), 'keep me');
    const trashed = await write({ action: 'trash', paths: [a] });
    const id = trashed.done[0]?.trashId ?? '';
    expect(id).toBe('a.txt');
    await expect(lstat(a)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(world.trash.root, 'files', id), 'utf8')).toBe('keep me');
    expect(await readFile(join(world.trash.root, 'info', 'a.txt.trashinfo'), 'utf8')).toBe(
      `[Trash Info]\nPath=${a}\nDeletionDate=2026-10-17T10:00:00\n`,
    );
    const restored = await write({ action: 'restore', items: [id] });
    expect(restored.done).toEqual([{ path: a, newPath: null, trashId: id }]);
    expect(await readFile(a, 'utf8')).toBe('keep me');
    expect(await readdir(join(world.trash.root, 'info'))).toEqual([]);
  });

  it('gives items of the same name different ids', async () => {
    const first = await file(join(world.home, 'one', 'same.txt'));
    const second = await file(join(world.home, 'two', 'same.txt'));
    const ids = (await write({ action: 'trash', paths: [first, second] })).done.map(
      (item) => item.trashId,
    );
    expect(ids).toEqual(['same.txt', 'same.txt.1']);
  });

  it('encodes odd characters in the recorded path and restores them', async () => {
    const odd = await file(join(world.home, 'my docs', 'a b#%.txt'));
    const id = (await write({ action: 'trash', paths: [odd] })).done[0]?.trashId ?? '';
    expect(await readFile(join(world.trash.root, 'info', `${id}.trashinfo`), 'utf8')).toContain(
      'my%20docs/a%20b%23%25.txt',
    );
    expect((await write({ action: 'restore', items: [id] })).done[0]?.path).toBe(odd);
  });

  it('will not restore over something that took the place', async () => {
    const a = await file(join(world.home, 'a.txt'), 'old');
    const id = (await write({ action: 'trash', paths: [a] })).done[0]?.trashId ?? '';
    await file(a, 'new');
    expect((await write({ action: 'restore', items: [id] })).failed[0]?.reason).toContain(
      'already there',
    );
    expect(await readFile(a, 'utf8')).toBe('new');
    expect(await readdir(join(world.trash.root, 'files'))).toEqual([id]);
  });

  it.each(['../escape', 'a/b', '..', 'unknown'])('does not restore %j', async (item) => {
    expect((await write({ action: 'restore', items: [item] })).failed[0]?.reason).toBe(
      'That item is not in the Trash.',
    );
  });

  it('recreates the folder the item came from when it is gone', async () => {
    const a = await file(join(world.home, 'gone', 'a.txt'));
    const id = (await write({ action: 'trash', paths: [a] })).done[0]?.trashId ?? '';
    await rm(join(world.home, 'gone'), { recursive: true });
    await write({ action: 'restore', items: [id] });
    expect(await readFile(a, 'utf8')).toBe('x');
  });

  it('trashes whole folders and refuses something already in the Trash', async () => {
    await file(join(world.home, 'dir', 'f.txt'));
    const result = await write({ action: 'trash', paths: [join(world.home, 'dir')] });
    expect(result.done).toHaveLength(1);
    await expect(stat(join(world.trash.root, 'files', 'dir', 'f.txt'))).resolves.toBeDefined();
    expect(
      (await write({ action: 'trash', paths: [join(world.trash.root, 'files', 'dir')] })).failed[0]
        ?.reason,
    ).toContain('already in the Trash');
  });
});

describe('uploads', () => {
  interface Piece {
    readonly path: string;
    readonly start: number;
    readonly text: string;
    readonly final: boolean;
    readonly replace?: boolean;
  }

  const chunk = (piece: Piece): Parameters<FileUploads['receive']>[0] => ({
    path: piece.path,
    start: piece.start,
    data: Buffer.from(piece.text).toString('base64'),
    final: piece.final,
    replace: piece.replace ?? false,
  });

  it('assembles chunks in order and shows nothing until the last arrives', async () => {
    const uploads = new FileUploads(world.scope);
    const path = join(world.home, 'big.bin');
    expect(await uploads.receive(chunk({ path, start: 0, text: 'hello ', final: false }))).toEqual({
      path,
      size: 6,
      complete: false,
    });
    await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await uploads.receive(chunk({ path, start: 6, text: 'world', final: true }))).toEqual({
      path,
      size: 11,
      complete: true,
    });
    expect(await readFile(path, 'utf8')).toBe('hello world');
    expect(await readdir(world.home)).toEqual(['big.bin']);
  });

  it('refuses a chunk that skips ahead', async () => {
    const uploads = new FileUploads(world.scope);
    const path = join(world.home, 'a.bin');
    await uploads.receive(chunk({ path, start: 0, text: 'abc', final: false }));
    await expect(
      uploads.receive(chunk({ path, start: 10, text: 'x', final: false })),
    ).rejects.toThrow('out of order: expected byte 3, got 10');
  });

  it('starting again from zero restarts the upload', async () => {
    const uploads = new FileUploads(world.scope);
    const path = join(world.home, 'a.bin');
    await uploads.receive(chunk({ path, start: 0, text: 'old data', final: false }));
    await uploads.receive(chunk({ path, start: 0, text: 'new', final: true }));
    expect(await readFile(path, 'utf8')).toBe('new');
  });

  it('does not overwrite unless replace is set and never replaces a folder', async () => {
    const uploads = new FileUploads(world.scope);
    const path = await file(join(world.home, 'a.txt'), 'keep');
    await expect(
      uploads.receive(chunk({ path, start: 0, text: 'x', final: true })),
    ).rejects.toThrow('already there');
    expect(await readFile(path, 'utf8')).toBe('keep');
    await mkdir(join(world.home, 'folder'));
    await expect(
      uploads.receive(
        chunk({
          path: join(world.home, 'folder'),
          start: 0,
          text: 'x',
          final: true,
          replace: true,
        }),
      ),
    ).rejects.toThrow('folder');
    await uploads.receive(chunk({ path, start: 0, text: 'replaced', final: true, replace: true }));
    expect(await readFile(path, 'utf8')).toBe('replaced');
  });

  it('removes the partial file when the last chunk cannot land', async () => {
    const uploads = new FileUploads(world.scope);
    const path = join(world.home, 'a.txt');
    await uploads.receive(chunk({ path, start: 0, text: 'abc', final: false }));
    await file(path, 'appeared meanwhile');
    await expect(
      uploads.receive(chunk({ path, start: 3, text: 'def', final: true })),
    ).rejects.toThrow('already there');
    expect(await readdir(world.home)).toEqual(['a.txt']);
  });

  it('refuses to upload into the protected places or a missing folder', async () => {
    const uploads = new FileUploads(world.scope);
    await expect(
      uploads.receive(
        chunk({ path: join(world.root, 'nowhere', 'a.txt'), start: 0, text: 'x', final: true }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      uploads.receive(chunk({ path: world.home, start: 0, text: 'x', final: true })),
    ).rejects.toMatchObject({
      code: 'not_permitted',
    });
  });
});

describe('search', () => {
  function clock(): SearchClock & { advance: (ms: number) => void; step: number } {
    let now = 0;
    let next = 0;
    const time = {
      step: 0,
      now: (): number => {
        now += time.step;
        return now;
      },
      newId: (): string => `search-${String((next += 1))}`,
      advance: (ms: number): void => {
        now += ms;
      },
    };
    return time;
  }

  async function tree(): Promise<void> {
    await file(join(world.home, 'Report.txt'));
    await file(join(world.home, 'sub', 'deep', 'old report.md'));
    await file(join(world.home, 'sub', 'other.txt'));
    await file(join(world.home, '.hidden', 'REPORT'));
  }

  it('finds matches case-insensitively at any depth, shallow ones first, and flags hidden ones', async () => {
    await tree();
    const search = new FileSearch(world.scope, clock());
    const result = await search.search({ path: world.home, text: 'report', cursor: null });
    expect(result.next).toBeNull();
    expect(result.matches.map((match) => [match.name, match.hidden])).toEqual([
      ['Report.txt', false],
      ['REPORT', false],
      ['old report.md', false],
    ]);
    expect(result.scanned).toBeGreaterThanOrEqual(7);
  });

  it('streams pages with a cursor until the walk is done', async () => {
    await tree();
    for (let index = 0; index < 450; index += 1) {
      await writeFile(join(world.home, `match-${String(index)}.txt`), '');
    }
    const search = new FileSearch(world.scope, clock());
    let cursor: string | null = null;
    const sizes: number[] = [];
    do {
      const page: Awaited<ReturnType<FileSearch['search']>> = await search.search({
        path: world.home,
        text: 'match-',
        cursor,
      });
      sizes.push(page.matches.length);
      cursor = page.next;
    } while (cursor !== null);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(450);
    expect(sizes.length).toBeGreaterThan(1);
  });

  it('does not follow symlinked folders out of the starting folder', async () => {
    await file(join(world.root, 'outside', 'report-secret.txt'));
    await symlink(join(world.root, 'outside'), join(world.home, 'escape'));
    const result = await new FileSearch(world.scope, clock()).search({
      path: world.home,
      text: 'report',
      cursor: null,
    });
    expect(result.matches.map((match) => match.name)).toEqual([]);
  });

  it('tells the caller when a search has expired or never existed', async () => {
    await tree();
    const time = clock();
    const search = new FileSearch(world.scope, time);
    time.step = 1000;
    const first = await search.search({ path: world.home, text: 'zzz', cursor: null });
    time.step = 0;
    expect(first.next).not.toBeNull();
    await expect(
      search.search({ path: world.home, text: 'zzz', cursor: 'never' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    time.advance(11 * 60_000);
    await expect(
      search.search({ path: world.home, text: 'zzz', cursor: first.next }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects a start folder that is a file or missing', async () => {
    const search = new FileSearch(world.scope, clock());
    const a = await file(join(world.home, 'a.txt'));
    await expect(search.search({ path: a, text: 'x', cursor: null })).rejects.toMatchObject({
      code: 'not_supported',
    });
    await expect(
      search.search({ path: join(world.home, 'missing'), text: 'x', cursor: null }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('properties', () => {
  it('describes a file with owner words, permissions and times', async () => {
    const path = await file(join(world.home, 'note.md'), 'hello');
    const passwd = await file(
      join(world.root, 'passwd'),
      `user:x:${String(process.getuid?.())}:1:u:/h:/bin/sh\n`,
    );
    const reader = new FilePropertiesReader(world.scope, passwd, join(world.root, 'no-group'));
    const properties = await reader.read(path);
    expect(properties).toMatchObject({
      name: 'note.md',
      path,
      kind: 'file',
      size: 5,
      mimeType: 'text/markdown',
      owner: 'user',
      permissions: { readable: true, writable: true },
      linkTarget: null,
    });
    expect(properties.group).toBe(String(process.getgid?.()));
  });

  it('describes a symlink as a link without following it', async () => {
    const target = await file(join(world.root, 'outside.txt'));
    await symlink(target, join(world.home, 'l'));
    const reader = new FilePropertiesReader(world.scope);
    expect(await reader.read(join(world.home, 'l'))).toMatchObject({
      kind: 'link',
      linkTarget: target,
      mimeType: null,
    });
  });

  it('names missing paths', async () => {
    await expect(
      new FilePropertiesReader(world.scope).read(join(world.home, 'nope')),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
