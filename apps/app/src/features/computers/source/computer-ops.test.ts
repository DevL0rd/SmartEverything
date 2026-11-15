import { describe, expect, it } from 'vitest';
import type { FileOp, FileLocation } from '../../files';
import { nodeOfEntry, nodeOfTrash, type ComputerOrigin } from './computer-node';
import { changeOfOp, opResultOf, pathOfLocation, undoChangesOf } from './computer-ops';

const MOMENT = '2026-11-14T10:00:00.000Z';

const FILE = nodeOfEntry(
  {
    name: 'a.txt',
    path: '/home/dana/a.txt',
    kind: 'file',
    mime: 'text/plain',
    size: 1,
    modifiedAt: MOMENT,
    hidden: false,
  },
  true,
  [],
);

const BIN = nodeOfTrash({
  trashId: 'id-1',
  name: 'b.txt',
  originalPath: '/home/dana/b.txt',
  deletedAt: MOMENT,
  size: 1,
  kind: 'file',
});

const HOME: FileLocation = { place: '/home/dana', folder: null };

const INSIDE: FileLocation = { place: '/home/dana', folder: '/home/dana/Projects' };

type Op = FileOp<ComputerOrigin>;

describe('computer file changes', () => {
  it('turns a new folder into a path inside the folder it is made in', () => {
    expect(changeOfOp({ kind: 'new_folder', in: INSIDE, name: 'x' })).toEqual({
      action: 'new_folder',
      path: '/home/dana/Projects/x',
    });
    expect(changeOfOp({ kind: 'new_folder', in: HOME, name: 'x' })).toEqual({
      action: 'new_folder',
      path: '/home/dana/x',
    });
  });

  it('renames, moves and copies by path without replacing anything', () => {
    expect(changeOfOp({ kind: 'rename', node: FILE, name: 'z.txt' })).toEqual({
      action: 'rename',
      path: '/home/dana/a.txt',
      name: 'z.txt',
    });
    expect(changeOfOp({ kind: 'move', nodes: [FILE], to: INSIDE })).toEqual({
      action: 'move',
      paths: ['/home/dana/a.txt'],
      to: '/home/dana/Projects',
      replace: false,
    });
    expect(changeOfOp({ kind: 'copy', nodes: [FILE], to: HOME })).toEqual({
      action: 'copy',
      paths: ['/home/dana/a.txt'],
      to: '/home/dana',
      replace: false,
    });
  });

  it('trashes by path and restores or deletes by trash id', () => {
    expect(changeOfOp({ kind: 'trash', nodes: [FILE] })).toEqual({
      action: 'trash',
      paths: ['/home/dana/a.txt'],
    });
    expect(changeOfOp({ kind: 'restore', nodes: [BIN] })).toEqual({
      action: 'restore',
      items: ['id-1'],
    });
    expect(changeOfOp({ kind: 'delete_now', nodes: [BIN] })).toEqual({
      action: 'delete_now',
      items: ['id-1'],
    });
  });

  it('has no change for an empty selection, a live file in the bin ops or a star', () => {
    expect(changeOfOp({ kind: 'trash', nodes: [] })).toBeNull();
    expect(changeOfOp({ kind: 'restore', nodes: [FILE] })).toBeNull();
    const star: Op = { kind: 'star', nodes: [FILE] };
    expect(changeOfOp(star)).toBeNull();
    expect(changeOfOp({ kind: 'unstar', nodes: [FILE] })).toBeNull();
  });

  it('reads the place root when no folder is named', () => {
    expect(pathOfLocation(HOME)).toBe('/home/dana');
    expect(pathOfLocation(INSIDE)).toBe('/home/dana/Projects');
  });

  it('turns a write result into done keys, failures and an undo', () => {
    const result = {
      done: [{ path: '/home/dana/a.txt', newPath: null, trashId: 'id-9' }],
      failed: [{ path: '/home/dana/b.txt', reason: 'Permission denied' }],
    };
    const undo = (): Promise<never> => Promise.reject(new Error('unused'));
    expect(opResultOf(result, null)).toEqual({
      done: ['/home/dana/a.txt'],
      failed: [{ key: '/home/dana/b.txt', reason: 'Permission denied' }],
      undo: null,
    });
    expect(opResultOf(result, undo).undo).toBe(undo);
  });
});

describe('undoing a computer file change', () => {
  it('restores what was moved to the Trash by its trash ids', () => {
    const result = {
      done: [{ path: '/home/dana/a.txt', newPath: null, trashId: 'id-9' }],
      failed: [],
    };
    expect(undoChangesOf({ action: 'trash', paths: ['/home/dana/a.txt'] }, result)).toEqual([
      { action: 'restore', items: ['id-9'] },
    ]);
  });

  it('moves each moved item back to the folder it came from', () => {
    const result = {
      done: [
        { path: '/home/dana/a.txt', newPath: '/home/dana/Projects/a.txt', trashId: null },
        { path: '/home/dana/notes/b.txt', newPath: '/home/dana/Projects/b.txt', trashId: null },
        { path: '/home/dana/c.txt', newPath: '/home/dana/Projects/c.txt', trashId: null },
      ],
      failed: [],
    };
    const change = {
      action: 'move' as const,
      paths: ['/home/dana/a.txt', '/home/dana/notes/b.txt', '/home/dana/c.txt'],
      to: '/home/dana/Projects',
      replace: false,
    };
    expect(undoChangesOf(change, result)).toEqual([
      {
        action: 'move',
        paths: ['/home/dana/Projects/a.txt', '/home/dana/Projects/c.txt'],
        to: '/home/dana',
        replace: false,
      },
      {
        action: 'move',
        paths: ['/home/dana/Projects/b.txt'],
        to: '/home/dana/notes',
        replace: false,
      },
    ]);
  });

  it('moves the copies to the Trash, which can itself be undone', () => {
    const result = {
      done: [{ path: '/home/dana/a.txt', newPath: '/home/dana/Projects/a.txt', trashId: null }],
      failed: [],
    };
    const change = {
      action: 'copy' as const,
      paths: ['/home/dana/a.txt'],
      to: '/home/dana/Projects',
      replace: false,
    };
    expect(undoChangesOf(change, result)).toEqual([
      { action: 'trash', paths: ['/home/dana/Projects/a.txt'] },
    ]);
  });

  it('offers nothing to undo when nothing was done or the change has no way back', () => {
    const empty = { done: [], failed: [] };
    expect(undoChangesOf({ action: 'trash', paths: ['/a'] }, empty)).toEqual([]);
    expect(undoChangesOf({ action: 'delete_now', items: ['id-1'] }, empty)).toEqual([]);
  });
});
