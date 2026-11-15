import {
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { until } from './hub-harness.js';
import { CONVERGE_MS, openLab, type Lab, type Peer } from './engine-support.js';
import { MemoryXattrs } from './meta-support.js';

let lab: Lab;

vi.setConfig({ testTimeout: 60_000 });

beforeEach(async () => {
  lab = await openLab();
});

afterEach(async () => {
  await lab.close();
});

async function put(peer: Peer, relPath: string, content: string, mode?: number): Promise<void> {
  const disk = join(peer.localPath, ...relPath.split('/'));
  await mkdir(dirname(disk), { recursive: true });
  await writeFile(disk, content);
  if (mode !== undefined) await chmod(disk, mode);
}

function at(peer: Peer, relPath: string): string {
  return join(peer.localPath, ...relPath.split('/'));
}

async function modeOf(peer: Peer, relPath: string): Promise<number | null> {
  return lstat(at(peer, relPath)).then(
    (info) => info.mode & 0o7777,
    () => null,
  );
}

async function targetOf(peer: Peer, relPath: string): Promise<string | null> {
  return readlink(at(peer, relPath)).then(
    (target) => target,
    () => null,
  );
}

async function pair(meta?: { desk: MemoryXattrs; laptop: MemoryXattrs }): Promise<[Peer, Peer]> {
  const desk = await lab.peer('desk', {}, meta?.desk);
  const laptop = await lab.peer('laptop', {}, meta?.laptop);
  return [desk, laptop];
}

function expectClean(...peers: Peer[]): void {
  for (const peer of peers) expect(peer.failures).toEqual([]);
}

describe('modes', () => {
  it('delivers the executable bit of a new file and a later chmod', async () => {
    const [desk, laptop] = await pair();
    await put(desk, 'run.sh', 'echo', 0o755);
    await desk.engine.start();
    await laptop.engine.start();
    await until(async () => (await modeOf(laptop, 'run.sh')) === 0o755, 'the mode', CONVERGE_MS);
    await chmod(at(desk, 'run.sh'), 0o640);
    await until(async () => (await modeOf(laptop, 'run.sh')) === 0o640, 'the chmod', CONVERGE_MS);
    expect(await readFile(at(laptop, 'run.sh'), 'utf8')).toBe('echo');
    expectClean(desk, laptop);
  });

  it('delivers the mode of a folder after the files inside it', async () => {
    const [desk, laptop] = await pair();
    await put(desk, 'closed/inner.txt', 'x');
    await chmod(at(desk, 'closed'), 0o555);
    await desk.engine.start();
    await laptop.engine.start();
    await until(async () => (await modeOf(laptop, 'closed')) === 0o555, 'the folder', CONVERGE_MS);
    expect(await readFile(at(laptop, 'closed/inner.txt'), 'utf8')).toBe('x');
    await chmod(at(desk, 'closed'), 0o755);
    await chmod(at(laptop, 'closed'), 0o755);
    expectClean(desk, laptop);
  });

  it('does not rewrite the content of a file that only changed mode', async () => {
    const [desk, laptop] = await pair();
    await put(desk, 'a.txt', 'same');
    await desk.engine.start();
    await laptop.engine.start();
    await until(async () => (await modeOf(laptop, 'a.txt')) === 0o644, 'the file', CONVERGE_MS);
    const before = await stat(at(laptop, 'a.txt'), { bigint: true });
    await chmod(at(desk, 'a.txt'), 0o600);
    await until(async () => (await modeOf(laptop, 'a.txt')) === 0o600, 'the chmod', CONVERGE_MS);
    const after = await stat(at(laptop, 'a.txt'), { bigint: true });
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeNs).toBe(before.mtimeNs);
  });
});

describe('times', () => {
  it('delivers a changed modification time without new content', async () => {
    const [desk, laptop] = await pair();
    await put(desk, 'a.txt', 'same');
    await desk.engine.start();
    await laptop.engine.start();
    await until(async () => (await modeOf(laptop, 'a.txt')) === 0o644, 'the file', CONVERGE_MS);
    const moment = new Date('2020-05-06T07:08:09.123Z');
    await utimes(at(desk, 'a.txt'), moment, moment);
    await until(
      async () =>
        Math.abs((await stat(at(laptop, 'a.txt'))).mtime.getTime() - moment.getTime()) <= 1,
      'the time',
      CONVERGE_MS,
    );
    expectClean(desk, laptop);
  });
});

describe('symlinks', () => {
  it('creates, retargets and removes a symlink on the other computer', async () => {
    const [desk, laptop] = await pair();
    await put(desk, 'real.txt', 'data');
    await put(desk, 'other/second.txt', 'more');
    await symlink('real.txt', at(desk, 'alias'));
    await desk.engine.start();
    await laptop.engine.start();
    await until(
      async () => (await targetOf(laptop, 'alias')) === 'real.txt',
      'the link',
      CONVERGE_MS,
    );
    await rm(at(desk, 'alias'));
    await symlink('other/second.txt', at(desk, 'alias'));
    await until(
      async () => (await targetOf(laptop, 'alias')) === 'other/second.txt',
      'the new target',
      CONVERGE_MS,
    );
    await rm(at(desk, 'alias'));
    await until(async () => (await targetOf(laptop, 'alias')) === null, 'the removal', CONVERGE_MS);
    expect(await readFile(at(laptop, 'real.txt'), 'utf8')).toBe('data');
    expectClean(desk, laptop);
  });

  it('replaces a file by a symlink and back', async () => {
    const [desk, laptop] = await pair();
    await put(desk, 'swap', 'file content');
    await desk.engine.start();
    await laptop.engine.start();
    await until(async () => (await modeOf(laptop, 'swap')) === 0o644, 'the file', CONVERGE_MS);
    await rm(at(desk, 'swap'));
    await symlink('target', at(desk, 'swap'));
    await until(async () => (await targetOf(laptop, 'swap')) === 'target', 'the link', CONVERGE_MS);
    await rm(at(desk, 'swap'));
    await put(desk, 'swap', 'file again');
    await until(
      async () => (await readFile(at(laptop, 'swap'), 'utf8').catch(() => null)) === 'file again',
      'the file again',
      CONVERGE_MS,
    );
    expectClean(desk, laptop);
  });
});

describe('hard links', () => {
  it('makes two names of one file two names of one file on the other computer', async () => {
    const [desk, laptop] = await pair();
    await put(desk, 'a.txt', 'shared');
    await link(at(desk, 'a.txt'), at(desk, 'b.txt'));
    await desk.engine.start();
    await laptop.engine.start();
    await until(
      async () =>
        (await modeOf(laptop, 'a.txt')) !== null && (await modeOf(laptop, 'b.txt')) !== null,
      'both names',
      CONVERGE_MS,
    );
    const first = await stat(at(laptop, 'a.txt'));
    const second = await stat(at(laptop, 'b.txt'));
    expect(second.ino).toBe(first.ino);
    expect(first.nlink).toBe(2);
    expect(await readFile(at(laptop, 'b.txt'), 'utf8')).toBe('shared');
    expectClean(desk, laptop);
  });
});

describe('extended attributes', () => {
  it('delivers a user attribute and its removal', async () => {
    const held = { desk: new MemoryXattrs(), laptop: new MemoryXattrs() };
    const [desk, laptop] = await pair(held);
    await put(desk, 'tagged.txt', 'x');
    await desk.engine.start();
    await laptop.engine.start();
    await until(
      async () => (await modeOf(laptop, 'tagged.txt')) === 0o644,
      'the file',
      CONVERGE_MS,
    );
    const tag = { name: 'user.tag', value: Buffer.from('red').toString('base64') };
    held.desk.held.set(at(desk, 'tagged.txt'), [tag]);
    await desk.engine.rescan();
    await until(
      () =>
        JSON.stringify(held.laptop.held.get(at(laptop, 'tagged.txt'))) === JSON.stringify([tag]),
      'the attribute',
      CONVERGE_MS,
    );
    held.desk.held.set(at(desk, 'tagged.txt'), []);
    await desk.engine.rescan();
    await until(
      () => (held.laptop.held.get(at(laptop, 'tagged.txt')) ?? []).length === 0,
      'the removal',
      CONVERGE_MS,
    );
    expectClean(desk, laptop);
  });
});
