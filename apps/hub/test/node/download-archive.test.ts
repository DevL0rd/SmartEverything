import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  symlink,
  truncate,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DownloadPlan } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileDownloads, type DownloadClock } from '../../src/node/controls/linux/download-archive';
import { FileScope } from '../../src/node/controls/linux/file-scope';
import { zipChunks, type ZipEntry } from '../../src/node/controls/linux/zip-stream';

let root = '';
let home = '';
let downloads: FileDownloads;
let clockAt = 0;
let ids = 0;

const CLOCK: DownloadClock = { now: () => clockAt, newId: () => `session-${String(ids++)}` };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'se-zip-'));
  home = join(root, 'home');
  await mkdir(home);
  clockAt = 1_000_000;
  ids = 0;
  downloads = new FileDownloads(new FileScope([home]), CLOCK);
});

afterEach(async () => {
  await chmod(join(home, 'locked'), 0o755).catch(() => undefined);
  await rm(root, { recursive: true, force: true });
});

function zipPlan(plan: DownloadPlan): Extract<DownloadPlan, { kind: 'zip' }> {
  if (plan.kind !== 'zip') throw new Error('expected a zip plan');
  return plan;
}

async function drain(id: string, step: number): Promise<{ bytes: Buffer; reads: number }> {
  const parts: Buffer[] = [];
  let reads = 0;
  for (;;) {
    const chunk = await downloads.read(id, step);
    reads += 1;
    parts.push(Buffer.from(chunk.data, 'base64'));
    if (chunk.done) return { bytes: Buffer.concat(parts), reads };
  }
}

async function saved(name: string, bytes: Buffer): Promise<string> {
  const path = join(root, name);
  await writeFile(path, bytes);
  return path;
}

function listing(zip: string): string[] {
  const out = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 1 << 28 });
  expect(out.status).toBe(0);
  return out.stdout.split('\n').filter((line) => line !== '');
}

function intact(zip: string): void {
  const out = spawnSync('unzip', ['-t', zip], { encoding: 'utf8', maxBuffer: 1 << 28 });
  expect(out.stdout).toContain('No errors detected');
  expect(out.status).toBe(0);
}

function member(zip: string, name: string): Buffer {
  const out = spawnSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 28 });
  expect(out.status).toBe(0);
  return out.stdout;
}

async function openFiles(under: string): Promise<string[]> {
  const links = await Promise.all(
    (await readdir('/proc/self/fd')).map((fd) =>
      readlink(join('/proc/self/fd', fd)).catch(() => ''),
    ),
  );
  return links.filter((link) => link.startsWith(under));
}

function sha(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

async function tree(): Promise<Buffer> {
  const big = randomBytes(9 * 1024 * 1024);
  const base = join(home, 'proj');
  await mkdir(join(base, 'src', 'deep'), { recursive: true });
  await mkdir(join(base, 'empty'));
  await writeFile(join(base, 'readme.txt'), 'hello world');
  await writeFile(join(base, 'src', 'deep', 'naïve café ☕ 日本.txt'), 'unicode body');
  await writeFile(join(base, 'src', 'big.bin'), big);
  await writeFile(join(base, 'src', 'zero.txt'), '');
  await writeFile(join(base, 'photo.jpg'), Buffer.from([1, 2, 3, 4]));
  await symlink(join(base, 'readme.txt'), join(base, 'alias.txt'));
  await symlink(join(base, 'src'), join(base, 'src-link'));
  await symlink(join(base, 'gone'), join(base, 'broken'));
  return big;
}

describe('a single file', () => {
  it('stays a file with its own name, size and mime type', async () => {
    await writeFile(join(home, 'notes.md'), 'abc');
    const plan = await downloads.open([join(home, 'notes.md')]);
    expect(plan).toMatchObject({
      kind: 'file',
      name: 'notes.md',
      size: 3,
      mimeType: 'text/markdown',
      files: 1,
      folders: 0,
    });
  });

  it('is reached through a link, keeping the link name', async () => {
    await writeFile(join(home, 'real.txt'), 'abc');
    await symlink(join(home, 'real.txt'), join(home, 'link.txt'));
    const plan = await downloads.open([join(home, 'link.txt')]);
    expect(plan).toMatchObject({ kind: 'file', name: 'link.txt', path: join(home, 'real.txt') });
  });

  it('says a missing file is not there', async () => {
    await expect(downloads.open([join(home, 'absent')])).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('says an unreadable file cannot be read', async () => {
    const path = join(home, 'secret.txt');
    await writeFile(path, 'x', { mode: 0o000 });
    await expect(downloads.open([path])).rejects.toMatchObject({ code: 'not_permitted' });
  });
});

describe('a folder as a zip', () => {
  it('streams in small chunks and unzips to the same tree', async () => {
    const big = await tree();
    const plan = zipPlan(await downloads.open([join(home, 'proj')]));
    expect(plan).toMatchObject({ name: 'proj.zip', files: 6, folders: 4 });
    expect(plan.bytes).toBe(big.length + 'hello world'.length * 2 + 'unicode body'.length + 4);
    expect(plan.skipped.map((item) => item.path).sort()).toEqual([
      join(home, 'proj', 'broken'),
      join(home, 'proj', 'src-link'),
    ]);
    const { bytes, reads } = await drain(plan.id, 64 * 1024);
    expect(reads).toBeGreaterThan(20);
    const zip = await saved('proj.zip', bytes);
    intact(zip);
    expect(listing(zip).sort()).toEqual(
      [
        'Not included.txt',
        'proj/',
        'proj/alias.txt',
        'proj/empty/',
        'proj/photo.jpg',
        'proj/readme.txt',
        'proj/src/',
        'proj/src/big.bin',
        'proj/src/deep/',
        'proj/src/deep/naïve café ☕ 日本.txt',
        'proj/src/zero.txt',
      ].sort(),
    );
    expect(sha(member(zip, 'proj/src/big.bin'))).toBe(sha(big));
    expect(member(zip, 'proj/alias.txt').toString()).toBe('hello world');
    expect(member(zip, 'proj/src/deep/naïve café ☕ 日本.txt').toString()).toBe('unicode body');
    expect(member(zip, 'Not included.txt').toString()).toContain(
      'links to folders are not followed',
    );
  });

  it('keeps the modified time and the permissions', async () => {
    const path = join(home, 'proj');
    await mkdir(path);
    await writeFile(join(path, 'run.sh'), '#!/bin/sh\n', { mode: 0o755 });
    await utimes(
      join(path, 'run.sh'),
      new Date('2021-03-04T05:06:08'),
      new Date('2021-03-04T05:06:08'),
    );
    const plan = zipPlan(await downloads.open([path]));
    const zip = await saved('p.zip', (await drain(plan.id, 1 << 20)).bytes);
    const info = spawnSync('zipinfo', ['-l', zip], { encoding: 'utf8' }).stdout;
    expect(info).toContain('-rwxr-xr-x');
    expect(info).toContain('21-Mar-04 05:06');
  });

  it('adds an empty folder as an empty folder', async () => {
    await mkdir(join(home, 'nothing'));
    const plan = zipPlan(await downloads.open([join(home, 'nothing')]));
    expect(plan).toMatchObject({ files: 0, folders: 1, bytes: 0 });
    const zip = await saved('n.zip', (await drain(plan.id, 1 << 20)).bytes);
    intact(zip);
    expect(listing(zip)).toEqual(['nothing/']);
  });

  it('skips an unreadable file and an unreadable folder and says why', async () => {
    await mkdir(join(home, 'proj'));
    await writeFile(join(home, 'proj', 'ok.txt'), 'ok');
    await writeFile(join(home, 'proj', 'private.txt'), 'x', { mode: 0o000 });
    await mkdir(join(home, 'proj', 'locked'));
    await chmod(join(home, 'proj', 'locked'), 0o000);
    const plan = zipPlan(await downloads.open([join(home, 'proj')]));
    expect(plan.skipped).toHaveLength(2);
    expect(plan.skipped.every((item) => item.reason.includes('no permission'))).toBe(true);
    const zip = await saved('p.zip', (await drain(plan.id, 1 << 20)).bytes);
    intact(zip);
    expect(listing(zip)).toContain('proj/ok.txt');
    expect(member(zip, 'Not included.txt').toString()).toContain('private.txt');
    await chmod(join(home, 'proj', 'locked'), 0o755);
  });

  it('fails when nothing in it can be read', async () => {
    await mkdir(join(home, 'locked'));
    await chmod(join(home, 'locked'), 0o000);
    await expect(downloads.open([join(home, 'locked')])).rejects.toMatchObject({
      code: 'not_permitted',
    });
  });

  it('follows a link to a folder the person chose themselves', async () => {
    await mkdir(join(home, 'real'));
    await writeFile(join(home, 'real', 'a.txt'), 'a');
    await symlink(join(home, 'real'), join(home, 'shortcut'));
    const plan = zipPlan(await downloads.open([join(home, 'shortcut')]));
    expect(plan.files).toBe(1);
  });
});

describe('several items', () => {
  it('become one zip named after their folder, with clashing names kept apart', async () => {
    await mkdir(join(home, 'a'));
    await mkdir(join(home, 'b'));
    await writeFile(join(home, 'a', 'same.txt'), '1');
    await writeFile(join(home, 'b', 'same.txt'), '2');
    await writeFile(join(home, 'x.txt'), 'x');
    const plan = zipPlan(
      await downloads.open([
        join(home, 'a', 'same.txt'),
        join(home, 'b', 'same.txt'),
        join(home, 'x.txt'),
      ]),
    );
    expect(plan.name).toBe('Files.zip');
    const zip = await saved('m.zip', (await drain(plan.id, 1 << 20)).bytes);
    intact(zip);
    expect(listing(zip).sort()).toEqual(['same (2).txt', 'same.txt', 'x.txt']);
    const inHome = zipPlan(await downloads.open([join(home, 'x.txt'), join(home, 'a')]));
    expect(inHome.name).toBe('home.zip');
  });

  it('skips a missing item and still gives the rest', async () => {
    await writeFile(join(home, 'x.txt'), 'x');
    const plan = zipPlan(await downloads.open([join(home, 'x.txt'), join(home, 'gone.txt')]));
    expect(plan.skipped).toEqual([
      { path: join(home, 'gone.txt'), reason: 'It is no longer there.' },
    ]);
  });
});

describe('the open download', () => {
  it('closes early without leaving the session or a file open behind', async () => {
    await tree();
    const plan = zipPlan(await downloads.open([join(home, 'proj')]));
    const first = await downloads.read(plan.id, 5 * 1024 * 1024);
    expect(first.done).toBe(false);
    await downloads.close(plan.id);
    await expect(downloads.read(plan.id, 1000)).rejects.toMatchObject({ code: 'not_found' });
    expect(await openFiles(join(home, 'proj'))).toEqual([]);
  });

  it('is gone after it has finished', async () => {
    await writeFile(join(home, 'x.txt'), 'x');
    await mkdir(join(home, 'd'));
    const plan = zipPlan(await downloads.open([join(home, 'd')]));
    await drain(plan.id, 1 << 20);
    await expect(downloads.read(plan.id, 10)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('expires when nobody reads it', async () => {
    await mkdir(join(home, 'd'));
    const plan = zipPlan(await downloads.open([join(home, 'd')]));
    clockAt += 11 * 60_000;
    await expect(downloads.read(plan.id, 10)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('stops with a reason when a file disappears while it is being zipped', async () => {
    await mkdir(join(home, 'd'));
    await writeFile(join(home, 'd', 'a.txt'), 'a');
    const plan = zipPlan(await downloads.open([join(home, 'd')]));
    await rm(join(home, 'd', 'a.txt'));
    await expect(drain(plan.id, 1 << 20)).rejects.toMatchObject({ code: 'failed' });
  });
});

describe('the zip writer', () => {
  it('writes the 64-bit form when asked, and 7-Zip and unzip read it', async () => {
    const source = join(root, 'src.bin');
    await writeFile(source, Buffer.alloc(300_000, 7));
    const entries: ZipEntry[] = [
      {
        kind: 'file',
        name: 'src.bin',
        source,
        size: 300_000,
        mtime: new Date(),
        mode: 0o100644,
        compress: true,
      },
      { kind: 'text', name: 'note.txt', text: 'hi', mtime: new Date() },
    ];
    const parts: Buffer[] = [];
    for await (const part of zipChunks(entries, 1000)) parts.push(part);
    const zip = await saved('big.zip', Buffer.concat(parts));
    intact(zip);
    expect(spawnSync('7z', ['t', zip], { encoding: 'utf8' }).status).toBe(0);
    expect(member(zip, 'src.bin').equals(Buffer.alloc(300_000, 7))).toBe(true);
    const python = spawnSync(
      'python3',
      [
        '-c',
        'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print(len(z.namelist()))',
        zip,
      ],
      { encoding: 'utf8' },
    );
    expect(python.stdout.trim()).toBe('None\n2');
  });

  it('writes the 64-bit directory when there are more than 65,535 entries', async () => {
    const entries: ZipEntry[] = Array.from({ length: 70_000 }, (_, index) => ({
      kind: 'folder',
      name: `d${String(index)}/`,
      mtime: new Date(),
      mode: 0o40755,
    }));
    const parts: Buffer[] = [];
    for await (const part of zipChunks(entries)) parts.push(part);
    const zip = await saved('many.zip', Buffer.concat(parts));
    intact(zip);
    expect(listing(zip)).toHaveLength(70_000);
  });

  it('reads a sparse file of zeros that is bigger than the buffer', async () => {
    const source = join(root, 'sparse.bin');
    await writeFile(source, '');
    await truncate(source, 40 * 1024 * 1024);
    const plan = zipPlan(await downloads.open([source, join(home)]));
    const zip = await saved('s.zip', (await drain(plan.id, 4 * 1024 * 1024)).bytes);
    intact(zip);
    expect(member(zip, 'sparse.bin').length).toBe(40 * 1024 * 1024);
    expect(await readFile(source)).toHaveLength(40 * 1024 * 1024);
  });
});
