import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  create,
  diskNames,
  diskText,
  linkRequest,
  moving,
  openPosixRig,
  removal,
  save,
  symlinkRequest,
  type PosixRig,
} from './posix-rig';
import type { WriteUnits } from '../../../src/store/host/registry';
import type { UnitInput } from '../../../src/store/host/unit';

let rig: PosixRig;

beforeEach(async () => {
  rig = await openPosixRig(true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rig.close();
});

function kindsOf(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((op: unknown) =>
    typeof op === 'object' && op !== null && 'kind' in op && typeof op.kind === 'string'
      ? [op.kind]
      : [],
  );
}

function failNextOps(kinds: ReadonlySet<string>, message: string): void {
  const { host } = rig.opened.store;
  const write = host.write.bind(host);
  let failed = false;
  vi.spyOn(host, 'write').mockImplementation(
    <N extends keyof WriteUnits>(name: N, input: UnitInput<WriteUnits[N]>) => {
      const ops = name === 'driveOps' ? kindsOf(input) : [];
      if (!failed && ops.some((kind) => kinds.has(kind))) {
        failed = true;
        return Promise.reject(new Error(message));
      }
      return write(name, input);
    },
  );
}

function failNextWrite(): void {
  failNextOps(new Set(['create', 'write', 'repath']), 'the index refused the row');
}

describe('a failure in the index after the disk changed', () => {
  it('removes the new link name from the disk', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array());
    failNextWrite();
    await expect(
      rig.posix.link(rig.scope, linkRequest(file.ino, rig.rootIno, 'b')),
    ).rejects.toThrow('the index refused the row');
    expect(await diskNames(rig.mine)).toEqual(['a']);
    expect((await rig.posix.getattr(rig.scope, file.ino)).nlink).toBe(1);
  });

  it('removes the new symbolic link from the disk', async () => {
    failNextWrite();
    await expect(
      rig.posix.symlink(rig.scope, symlinkRequest('l', rig.rootIno, 't')),
    ).rejects.toThrow('the index refused the row');
    expect(await diskNames(rig.mine)).toEqual([]);
  });

  it('puts a moved file back where it was', async () => {
    await save(rig, rig.mine, 'a', 'text');
    failNextWrite();
    await expect(
      rig.posix.rename(rig.scope, moving([rig.rootIno, 'a'], [rig.rootIno, 'b'])),
    ).rejects.toThrow('the index refused the row');
    expect(await diskText(rig.mine, 'a')).toBe('text');
    expect(await diskNames(rig.mine)).toEqual(['a']);
  });

  it('puts a held file back under its name when the index cannot record the unlink', async () => {
    const file = await rig.posix.create(rig.scope, create('a', rig.rootIno), new Uint8Array());
    await save(rig, rig.mine, 'a', 'open');
    rig.held.add(file.ino);
    failNextOps(new Set(['orphan']), 'the index refused the orphan');
    await expect(
      rig.posix.unlink(rig.scope, await removal(rig, rig.scope, 'a', rig.rootIno)),
    ).rejects.toThrow('the index refused the orphan');
    expect(await diskText(rig.mine, 'a')).toBe('open');
    expect((await rig.posix.getattr(rig.scope, file.ino)).nlink).toBe(1);
  });
});
