import { execFileSync } from 'node:child_process';
import { chmod, link, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIgnoreMatcher, type SyncXattr } from '@smarteverything/domain/drive-sync';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inputOf, type FileRecord } from '../../src/drive-sync/db/index.js';
import { NoXattrPort, type MetaPort } from '../../src/drive-sync/meta-port.js';
import { scanRoot, type ScanResult } from '../../src/drive-sync/scan.js';
import { MemoryXattrs, contentHasher, refusingHasher } from './meta-support.js';

const ROOT = '55555555-5555-4555-8555-555555555555';
const log = new Logger('desktop.drive-sync');

let scratch = '';

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-scan-meta-'));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

async function scan(
  previous: readonly FileRecord[],
  options: {
    readonly meta?: MetaPort;
    readonly platform?: NodeJS.Platform;
    readonly hasher?: ReturnType<typeof contentHasher>;
  } = {},
): Promise<ScanResult> {
  return scanRoot({
    placementId: ROOT,
    rootPath: scratch,
    previous,
    ignore: createIgnoreMatcher([]),
    hasher: options.hasher ?? contentHasher(),
    platform: options.platform ?? process.platform,
    meta: options.meta ?? new NoXattrPort(),
    portablePaths: false,
    mtimeToleranceNs: 0n,
    quietMs: 0,
    now: () => Date.now(),
    log,
  });
}

function recorded(result: ScanResult, hubRev: number | null = 3): readonly FileRecord[] {
  return result.upserts.map((input) => ({ ...input, hubRev, pinned: false }));
}

function byPath(result: ScanResult, relPath: string): ScanResult['upserts'][number] {
  const found = result.upserts.find((input) => input.relPath === relPath);
  if (found === undefined) throw new Error(`${relPath} was not scanned`);
  return found;
}

describe('symlinks and special files', () => {
  it('records a symlink with its target instead of skipping it', async () => {
    await writeFile(join(scratch, 'real.txt'), 'data');
    await symlink('real.txt', join(scratch, 'alias'));
    await symlink('missing/target', join(scratch, 'dangling'));
    const result = await scan([]);
    expect(byPath(result, 'alias')).toMatchObject({
      kind: 'link',
      linkTarget: 'real.txt',
      bytes: 0,
      blocks: null,
      localHashState: 'hashed',
      metaDirty: true,
    });
    expect(byPath(result, 'dangling')).toMatchObject({
      kind: 'link',
      linkTarget: 'missing/target',
    });
    expect(result.skipped).toEqual([]);
  });

  it('plans nothing for a symlink that is unchanged and updates one whose target moved', async () => {
    await symlink('one', join(scratch, 'alias'));
    const first = recorded(await scan([]), 5).map((record) => ({ ...record, metaDirty: false }));
    expect((await scan(first)).upserts).toEqual([]);
    await rm(join(scratch, 'alias'));
    await symlink('two', join(scratch, 'alias'));
    const second = await scan(first);
    expect(byPath(second, 'alias')).toMatchObject({ linkTarget: 'two', hubRev: 5 });
  });

  it('skips a symlink on Windows and skips a fifo everywhere', async () => {
    await symlink('x', join(scratch, 'alias'));
    execFileSync('mkfifo', [join(scratch, 'pipe')]);
    const linux = await scan([]);
    expect(linux.skipped).toEqual([{ relPath: 'pipe', reason: 'special' }]);
    const windows = await scan([], { platform: 'win32' });
    expect(windows.skipped).toContainEqual({ relPath: 'alias', reason: 'symlink' });
    expect(windows.upserts.some((input) => input.relPath === 'alias')).toBe(false);
  });
});

describe('modes', () => {
  it('reads the full permission mode including the executable and set-id bits', async () => {
    await writeFile(join(scratch, 'tool'), 'x');
    await chmod(join(scratch, 'tool'), 0o4755);
    await mkdir(join(scratch, 'dir'));
    await chmod(join(scratch, 'dir'), 0o2750);
    const result = await scan([]);
    expect(byPath(result, 'tool').mode).toBe(0o4755);
    expect(byPath(result, 'dir').mode).toBe(0o2750);
  });

  it('notices a chmod without hashing the file again and keeps its blocks', async () => {
    await writeFile(join(scratch, 'run.sh'), 'echo');
    const first = recorded(await scan([]));
    await chmod(join(scratch, 'run.sh'), 0o755);
    const second = await scan(first, { hasher: refusingHasher() });
    const changed = byPath(second, 'run.sh');
    expect(changed.mode).toBe(0o755);
    expect(changed.hubRev).toBe(3);
    expect(changed.metaDirty).toBe(true);
    expect(Buffer.from(changed.blocks ?? [])).toEqual(Buffer.from(first[0]?.blocks ?? []));
  });

  it('keeps the recorded mode on Windows and defaults new files to 0644', async () => {
    await writeFile(join(scratch, 'old.txt'), 'a');
    await writeFile(join(scratch, 'new.txt'), 'b');
    const previous = recorded(await scan([]));
    const old = previous.find((record) => record.relPath === 'old.txt');
    if (old === undefined) throw new Error('missing');
    const seeded = [{ ...inputOf(old, { mode: 0o750, metaDirty: false }), pinned: false }];
    const result = await scan(seeded, { platform: 'win32' });
    expect(byPath(result, 'new.txt').mode).toBe(0o644);
    expect(result.upserts.some((input) => input.relPath === 'old.txt')).toBe(false);
  });

  it('plans a known file again while its metadata is still unpushed', async () => {
    await writeFile(join(scratch, 'a.txt'), 'a');
    const first = recorded(await scan([]));
    expect((await scan(first)).upserts).toHaveLength(1);
    const clean = first.map((record) => ({ ...record, metaDirty: false }));
    expect((await scan(clean)).upserts).toEqual([]);
  });
});

describe('hard links', () => {
  it('gives every name of one inode the same link key and other files none', async () => {
    await writeFile(join(scratch, 'a.txt'), 'shared');
    await link(join(scratch, 'a.txt'), join(scratch, 'b.txt'));
    await writeFile(join(scratch, 'c.txt'), 'alone');
    const result = await scan([]);
    const key = byPath(result, 'a.txt').linkKey;
    expect(key).not.toBeNull();
    expect(byPath(result, 'b.txt').linkKey).toBe(key);
    expect(byPath(result, 'c.txt').linkKey).toBeNull();
  });
});

describe('extended attributes', () => {
  it('reads the user attributes of files and folders through the port', async () => {
    await writeFile(join(scratch, 'tagged.txt'), 't');
    await mkdir(join(scratch, 'dir'));
    const port = new MemoryXattrs();
    const tag: SyncXattr = { name: 'user.tag', value: Buffer.from('red').toString('base64') };
    port.held.set(join(scratch, 'tagged.txt'), [tag]);
    port.held.set(join(scratch, 'dir'), [tag]);
    const result = await scan([], { meta: port });
    expect(byPath(result, 'tagged.txt').xattrs).toEqual([tag]);
    expect(byPath(result, 'dir').xattrs).toEqual([tag]);
  });

  it('notices an attribute change on an otherwise unchanged file', async () => {
    await writeFile(join(scratch, 'a.txt'), 'a');
    const port = new MemoryXattrs();
    const first = recorded(await scan([], { meta: port })).map((record) => ({
      ...record,
      metaDirty: false,
    }));
    port.held.set(join(scratch, 'a.txt'), [{ name: 'user.k', value: 'dg==' }]);
    const second = await scan(first, { meta: port, hasher: refusingHasher() });
    expect(byPath(second, 'a.txt').xattrs).toEqual([{ name: 'user.k', value: 'dg==' }]);
  });

  it('keeps the attributes of other namespaces the hub holds', async () => {
    await writeFile(join(scratch, 'a.txt'), 'a');
    const port = new MemoryXattrs();
    const foreign: SyncXattr = { name: 'security.label', value: 'eA==' };
    const first = recorded(await scan([], { meta: port })).map((record) => ({
      ...record,
      xattrs: [foreign],
      metaDirty: false,
    }));
    port.held.set(join(scratch, 'a.txt'), [{ name: 'user.k', value: 'dg==' }]);
    const second = await scan(first, { meta: port, hasher: refusingHasher() });
    expect(byPath(second, 'a.txt').xattrs).toEqual([
      { name: 'security.label', value: 'eA==' },
      { name: 'user.k', value: 'dg==' },
    ]);
  });

  it('keeps the recorded attributes where the platform cannot read them', async () => {
    await writeFile(join(scratch, 'a.txt'), 'a');
    const kept: SyncXattr = { name: 'user.k', value: 'dg==' };
    const first = recorded(await scan([])).map((record) => ({
      ...record,
      xattrs: [kept],
      metaDirty: false,
    }));
    const result = await scan(first);
    expect(result.upserts).toEqual([]);
    expect(first[0]?.xattrs).toEqual([kept]);
  });
});

it('carries the hub inode of a record through a rescan of changed content', async () => {
  await writeFile(join(scratch, 'a.txt'), 'one');
  const first = recorded(await scan([])).map((record) => ({ ...record, hubInode: 42 }));
  await writeFile(join(scratch, 'a.txt'), 'two!');
  const second = await scan(first);
  expect(byPath(second, 'a.txt')).toMatchObject({ hubInode: 42, hubRev: 3, linkTarget: null });
});
