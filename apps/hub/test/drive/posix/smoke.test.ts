import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create, diskText, mkdir, openPosixRig, type PosixRig } from './posix-rig';

let rig: PosixRig;

beforeEach(async () => {
  rig = await openPosixRig(true);
});

afterEach(async () => {
  await rig.close();
});

describe('smoke', () => {
  it('lists the empty root and makes a folder and a file', async () => {
    const root = await rig.posix.getattr(rig.scope, rig.rootIno);
    expect(root.nlink).toBe(2);
    const dir = await rig.posix.mkdir(rig.scope, mkdir('docs', rig.rootIno));
    const file = await rig.posix.create(rig.scope, create('a.txt', dir.ino));
    expect(file.attr.size).toBe(0);
    const page = await rig.posix.readdir(rig.scope, { ino: dir.ino, cursor: 0 });
    expect(page.entries.map(([name]) => name)).toEqual(['a.txt']);
    expect(await diskText(rig.mine, 'docs/a.txt')).toBe('');
  });
});
