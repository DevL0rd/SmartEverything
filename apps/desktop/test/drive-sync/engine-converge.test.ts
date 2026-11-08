import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPlaceholder } from '../../src/drive-sync/select.js';
import { bytesOf } from './pull-support.js';
import { until } from './hub-harness.js';
import { CONVERGE_MS, openLab, sees, snapshot, type Lab, type Peer } from './engine-support.js';

let lab: Lab;

vi.setConfig({ testTimeout: 60_000 });

beforeEach(async () => {
  lab = await openLab();
});

afterEach(async () => {
  await lab.close();
});

async function put(peer: Peer, relPath: string, content: string | Buffer): Promise<void> {
  const disk = join(peer.localPath, ...relPath.split('/'));
  await mkdir(dirname(disk), { recursive: true });
  await writeFile(disk, content);
}

function onHub(...relPaths: string[]): () => boolean {
  return () => relPaths.every((relPath) => lab.hub.itemRev(relPath) !== undefined);
}

async function hubText(relPath: string): Promise<string | null> {
  return lab.hub.readFile(relPath).then(
    (content) => content.toString(),
    () => null,
  );
}

function gone(relPath: string): () => boolean {
  return () => lab.hub.itemRev(relPath) === undefined;
}

describe('two engines on one root', () => {
  it('converges edits, renames and deletes in both directions', async () => {
    const desk = await lab.peer('desk');
    const laptop = await lab.peer('laptop');
    const big = bytesOf(2, 'b').toString();
    await put(desk, 'docs/a.txt', 'one');
    await put(desk, 'big.bin', big);
    await desk.engine.start();
    await until(onHub('big.bin'), 'the first push', CONVERGE_MS);
    await laptop.engine.start();
    await sees(laptop, { 'docs/a.txt': 'one', 'big.bin': big });
    await put(desk, 'docs/a.txt', 'one, edited');
    await sees(laptop, { 'docs/a.txt': 'one, edited', 'big.bin': big });
    await rename(join(desk.localPath, 'docs/a.txt'), join(desk.localPath, 'docs/renamed.txt'));
    await sees(laptop, { 'docs/renamed.txt': 'one, edited', 'big.bin': big });
    await rm(join(laptop.localPath, 'big.bin'));
    await sees(desk, { 'docs/renamed.txt': 'one, edited' });
    await until(gone('big.bin'), 'the hub delete', CONVERGE_MS);
    expect(await snapshot(laptop.localPath)).toEqual(await snapshot(desk.localPath));
    expect(desk.failures).toEqual([]);
    expect(laptop.failures).toEqual([]);
  });

  it('keeps both versions after a conflict and converges on the hub version', async () => {
    const desk = await lab.peer('desk');
    const laptop = await lab.peer('laptop');
    await put(desk, 'shared.txt', 'original');
    await desk.engine.start();
    await laptop.engine.start();
    await sees(laptop, { 'shared.txt': 'original' });
    await laptop.engine.pause();
    await put(desk, 'shared.txt', 'from the desk');
    await until(
      async () => (await hubText('shared.txt')) === 'from the desk',
      'the desk edit on the hub',
      CONVERGE_MS,
    );
    await put(laptop, 'shared.txt', 'from the laptop');
    await laptop.engine.resume();
    await until(() => laptop.conflicts.length > 0, 'the conflict', CONVERGE_MS);
    expect(laptop.conflicts[0]).toMatchObject({ kind: 'push', outcome: 'kept_copy' });
    const copy = laptop.conflicts[0]?.copyPath ?? '';
    expect(copy).not.toBe('');
    const expected = { 'shared.txt': 'from the desk', [copy]: 'from the laptop' };
    await sees(laptop, expected);
    await sees(desk, expected);
    expect((await lab.hub.readFile(copy)).toString()).toBe('from the laptop');
  });

  it('catches up after the connection drops and returns', async () => {
    const desk = await lab.peer('desk');
    const laptop = await lab.peer('laptop');
    await put(desk, 'before.txt', 'before');
    await desk.engine.start();
    await laptop.engine.start();
    await sees(laptop, { 'before.txt': 'before' });
    lab.transport.closeAll();
    await put(desk, 'during.txt', 'written while down');
    await until(
      async () => (await desk.engine.waiting()).pendingOps > 0,
      'a push waiting for the hub',
      CONVERGE_MS,
    );
    expect(lab.hub.itemRev('during.txt')).toBeUndefined();
    lab.transport.routeChanged();
    await sees(laptop, { 'before.txt': 'before', 'during.txt': 'written while down' });
    expect((await desk.engine.waiting()).pendingOps).toBe(0);
  });

  it('survives the hub cutting the sockets mid-run', async () => {
    const desk = await lab.peer('desk');
    const laptop = await lab.peer('laptop');
    await desk.engine.start();
    await laptop.engine.start();
    await put(desk, 'first.txt', 'first');
    await sees(laptop, { 'first.txt': 'first' });
    lab.hub.dropSockets();
    await put(laptop, 'second.txt', 'second');
    lab.transport.routeChanged();
    await sees(desk, { 'first.txt': 'first', 'second.txt': 'second' });
  });
});

describe('selective sync', () => {
  async function seeded(): Promise<{ desk: Peer; laptop: Peer }> {
    const desk = await lab.peer('desk');
    const laptop = await lab.peer('laptop');
    await put(desk, 'keep/k.txt', 'keep me');
    await put(desk, 'skip/s.txt', 'skipped');
    await put(desk, 'skip/deep/d.txt', 'deep skipped');
    await desk.engine.start();
    await until(onHub('keep/k.txt', 'skip/s.txt', 'skip/deep/d.txt'), 'the seed push', CONVERGE_MS);
    laptop.engine.selection.replace(['keep']);
    await laptop.engine.start();
    return { desk, laptop };
  }

  it('holds content only for selected folders and keeps the rest browsable', async () => {
    const { laptop } = await seeded();
    await sees(laptop, { 'keep/k.txt': 'keep me' });
    await until(
      () => isPlaceholder(laptop.database.files.get(lab.hub.rootId, 'skip/deep/d.txt')),
      'the placeholder metadata',
      CONVERGE_MS,
    );
    const placeholder = laptop.database.files.get(lab.hub.rootId, 'skip/s.txt');
    expect(placeholder).toMatchObject({ bytes: 7, hubRev: lab.hub.itemRev('skip/s.txt') });
    expect(laptop.engine.previewSelection(['keep', 'skip'])).toBe(7 + 12);
    await expect(stat(join(laptop.localPath, 'skip/s.txt'))).rejects.toThrow();
  });

  it('downloads a folder when it joins the selection and drops it when it leaves', async () => {
    const { desk, laptop } = await seeded();
    await sees(laptop, { 'keep/k.txt': 'keep me' });
    await until(
      () => isPlaceholder(laptop.database.files.get(lab.hub.rootId, 'skip/s.txt')),
      'the placeholder metadata',
      CONVERGE_MS,
    );
    const applied = await laptop.engine.setSelection(['keep', 'skip']);
    expect(applied.released).toBe(2);
    const everything = await snapshot(desk.localPath);
    await sees(laptop, everything);
    const narrowed = await laptop.engine.setSelection(['keep']);
    expect(narrowed.kept).toEqual([]);
    await sees(laptop, { 'keep/k.txt': 'keep me' });
    await put(laptop, 'keep/after.txt', 'after');
    await sees(desk, { ...everything, 'keep/after.txt': 'after' });
    expect(lab.hub.itemRev('skip/s.txt')).toBeDefined();
    expect((await readFile(join(desk.localPath, 'skip/s.txt'))).toString()).toBe('skipped');
  });
});
