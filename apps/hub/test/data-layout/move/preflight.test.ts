import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hubLayout, writeMarker } from '../../../src/data-layout';
import { writeMoveMarker } from '../../../src/data-layout/move/manifest';
import {
  PreflightRefusal,
  runPreflight,
  type PreflightInput,
  type PreflightOperations,
  type PreflightRefusalCode,
} from '../../../src/data-layout/move/preflight';

const ROOT_ID = '11111111-1111-4111-8111-111111111111';
const MOVE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_MOVE = '44444444-4444-4444-8444-444444444444';
const NFS_MAGIC = 0x6969;
const EXT4_MAGIC = 0xef53;
let work: string;
let oldRoot: string;
let install: string;
let bootstrap: string;

const ample = { type: EXT4_MAGIC, blockSize: 4096, availableBlocks: 1_000_000 };

function operations(overrides: Partial<PreflightOperations> = {}): PreflightOperations {
  return {
    space: () => Promise.resolve(ample),
    probe: () => Promise.resolve(),
    reflink: () => Promise.resolve(false),
    ...overrides,
  };
}

function input(newRoot: string, overrides: Partial<PreflightInput> = {}): PreflightInput {
  return {
    oldRoot,
    newRoot,
    rootId: ROOT_ID,
    moveId: MOVE_ID,
    installDirectory: install,
    bootstrapDirectory: bootstrap,
    bytesToCopy: 1000,
    ...overrides,
  };
}

async function refusal(
  request: PreflightInput,
  ops: PreflightOperations = operations(),
): Promise<PreflightRefusalCode> {
  const error = await runPreflight(request, ops).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(error).toBeInstanceOf(PreflightRefusal);
  return error instanceof PreflightRefusal ? error.code : 'not-a-folder';
}

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'move-preflight-'));
  oldRoot = join(work, 'old');
  install = join(work, 'install');
  bootstrap = join(work, 'bootstrap');
  for (const folder of [oldRoot, install, bootstrap]) {
    await mkdir(folder, { recursive: true });
  }
  await writeFile(join(oldRoot, 'layout.json'), '{}');
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

describe('preflight', () => {
  it('accepts a new folder that does not exist yet', async () => {
    const result = await runPreflight(input(join(work, 'new/data')), operations());
    expect(result).toMatchObject({ resume: false, reflink: false, requiredBytes: 1000 });
  });

  it('accepts an empty existing folder', async () => {
    await mkdir(join(work, 'empty'));
    expect((await runPreflight(input(join(work, 'empty')), operations())).resume).toBe(false);
  });

  it.each(['inside-old-root', 'contains-old-root', 'inside-install', 'inside-bootstrap'] as const)(
    'refuses %s',
    async (code) => {
      const targets = {
        'inside-old-root': join(oldRoot, 'sub'),
        'contains-old-root': work,
        'inside-install': join(install, 'sub'),
        'inside-bootstrap': join(bootstrap, 'sub'),
      };
      expect(await refusal(input(targets[code]))).toBe(code);
    },
  );

  it('refuses the old root itself', async () => {
    expect(await refusal(input(oldRoot))).toBe('inside-old-root');
  });

  it('refuses a folder that contains the install or the bootstrap folder', async () => {
    const nested = join(work, 'holder');
    const holderInstall = join(nested, 'install');
    await mkdir(holderInstall, { recursive: true });
    expect(await refusal(input(nested, { installDirectory: holderInstall }))).toBe(
      'contains-install',
    );
    const holderBootstrap = join(nested, 'bootstrap');
    await mkdir(holderBootstrap);
    expect(await refusal(input(nested, { bootstrapDirectory: holderBootstrap }))).toBe(
      'contains-bootstrap',
    );
  });

  it('sees through a symlink into the old root', async () => {
    const link = join(work, 'link');
    await symlink(oldRoot, link);
    expect(await refusal(input(join(link, 'inner')))).toBe('inside-old-root');
  });

  it('refuses a file where the folder should be', async () => {
    const file = join(work, 'file');
    await writeFile(file, 'x');
    expect(await refusal(input(file))).toBe('not-a-folder');
    expect(await refusal(input(join(file, 'child')))).toBe('not-a-folder');
  });

  it('refuses a non-empty folder without this move marker', async () => {
    const target = join(work, 'busy');
    await mkdir(target);
    await writeFile(join(target, 'foreign.txt'), 'x');
    expect(await refusal(input(target))).toBe('not-empty');
  });

  it('refuses a folder holding another move marker', async () => {
    const target = join(work, 'other');
    await mkdir(target);
    await writeMoveMarker(target, { moveId: OTHER_MOVE, rootId: ROOT_ID });
    expect(await refusal(input(target))).toBe('not-empty');
  });

  it('resumes into a folder holding this move marker', async () => {
    const target = join(work, 'partial');
    await mkdir(target);
    await writeMoveMarker(target, { moveId: MOVE_ID, rootId: ROOT_ID });
    expect((await runPreflight(input(target), operations())).resume).toBe(true);
  });

  it('resumes into a moved layout with the same root id and refuses another root id', async () => {
    const target = join(work, 'back');
    await mkdir(target);
    const layout = hubLayout(target, {});
    const marker = { version: 1, createdAt: new Date().toISOString(), state: 'moved' } as const;
    await writeMarker(layout, { ...marker, rootId: ROOT_ID, movedTo: oldRoot });
    expect((await runPreflight(input(target), operations())).resume).toBe(true);
    await writeMarker(layout, {
      ...marker,
      rootId: '22222222-2222-4222-8222-222222222222',
      movedTo: oldRoot,
    });
    expect(await refusal(input(target))).toBe('not-empty');
  });

  it('refuses a folder that is not writable', async () => {
    const target = join(work, 'readonly');
    await mkdir(target, { mode: 0o500 });
    expect(await refusal(input(join(target, 'data')))).toBe('not-writable');
    await rm(target, { recursive: true, force: true });
  });

  it('refuses a network filesystem', async () => {
    const ops = operations({
      space: () => Promise.resolve({ ...ample, type: NFS_MAGIC }),
    });
    expect(await refusal(input(join(work, 'nas')), ops)).toBe('network-filesystem');
  });

  it('refuses when the safety probe fails', async () => {
    const ops = operations({ probe: () => Promise.reject(new Error('rename failed')) });
    expect(await refusal(input(join(work, 'bad')), ops)).toBe('probe-failed');
  });

  it('runs the real probe on a real folder', async () => {
    const result = await runPreflight(input(join(work, 'real')));
    expect(result.freeBytes).toBeGreaterThan(0);
  });

  it('refuses when copying would not fit', async () => {
    const ops = operations({
      space: () => Promise.resolve({ ...ample, availableBlocks: 1 }),
    });
    expect(await refusal(input(join(work, 'small'), { bytesToCopy: 10_000 }), ops)).toBe(
      'not-enough-space',
    );
  });

  it('needs no space for a reflink copy', async () => {
    const ops = operations({
      space: () => Promise.resolve({ ...ample, availableBlocks: 1 }),
      reflink: () => Promise.resolve(true),
    });
    const result = await runPreflight(input(join(work, 'clone'), { bytesToCopy: 10_000 }), ops);
    expect(result).toMatchObject({ reflink: true, requiredBytes: 0 });
  });
});
