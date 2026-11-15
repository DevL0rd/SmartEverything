import { describe, expect, it } from 'vitest';
import { abilitiesOf } from './abilities';
import { COMPUTER_FULL } from './fixture-seeds';
import { nodeOfEntry } from './fixture-tree';
import {
  NOTHING_DONE,
  nodesOfOp,
  opAllowed,
  opNoticeOf,
  opTargetsLocation,
  refusedOf,
} from './ops';

const file = nodeOfEntry({ key: 'f', parentKey: 'p', name: 'a.txt' });
const locked = nodeOfEntry({
  key: 'l',
  parentKey: 'p',
  name: 'b.txt',
  writable: false,
  exportable: false,
});
const HERE = { place: 'p', folder: null };

describe('ops', () => {
  it('allows an op only with its ability and on nodes it can change', () => {
    expect(opAllowed({ kind: 'trash', nodes: [file] }, COMPUTER_FULL)).toBe(true);
    expect(opAllowed({ kind: 'trash', nodes: [locked] }, COMPUTER_FULL)).toBe(false);
    expect(opAllowed({ kind: 'copy', nodes: [locked], to: HERE }, COMPUTER_FULL)).toBe(false);
    expect(opAllowed({ kind: 'star', nodes: [locked] }, abilitiesOf(['star']))).toBe(true);
    expect(opAllowed({ kind: 'star', nodes: [file] }, COMPUTER_FULL)).toBe(false);
    expect(opAllowed({ kind: 'trash', nodes: [] }, COMPUTER_FULL)).toBe(false);
    expect(opAllowed({ kind: 'new_folder', in: HERE, name: 'x' }, COMPUTER_FULL)).toBe(true);
  });

  it('names the nodes and the target of an op', () => {
    expect(nodesOfOp({ kind: 'rename', node: file, name: 'b' })).toEqual([file]);
    expect(nodesOfOp({ kind: 'new_folder', in: HERE, name: 'x' })).toEqual([]);
    expect(opTargetsLocation({ kind: 'move', nodes: [file], to: HERE })).toBe(HERE);
    expect(opTargetsLocation({ kind: 'trash', nodes: [file] })).toBeNull();
    expect(refusedOf({ kind: 'trash', nodes: [file, locked] }, 'No').failed).toEqual([
      { key: 'f', reason: 'No' },
      { key: 'l', reason: 'No' },
    ]);
  });

  it('words the notice for done, partly done and failed ops', () => {
    const undo = (): Promise<typeof NOTHING_DONE> => Promise.resolve(NOTHING_DONE);
    const trash = { kind: 'trash', nodes: [file, locked] } as const;
    expect(opNoticeOf(trash, { done: ['f', 'l'], failed: [], undo })).toMatchObject({
      tone: 'done',
      title: 'Moved to Trash · 2 items',
      undo,
    });
    expect(
      opNoticeOf(trash, { done: ['f'], failed: [{ key: 'l', reason: 'Read only' }], undo }),
    ).toMatchObject({
      tone: 'partial',
      title: 'Moved to Trash · 1 item · 1 item couldn’t be moved to Trash',
      reasons: ['Read only'],
    });
    expect(
      opNoticeOf(trash, {
        done: [],
        failed: [
          { key: 'f', reason: 'x' },
          { key: 'l', reason: 'x' },
        ],
        undo,
      }),
    ).toMatchObject({
      tone: 'failed',
      reasons: ['x'],
      undo: null,
    });
    const folder = { kind: 'new_folder', in: HERE, name: 'x' } as const;
    expect(opNoticeOf(folder, { done: ['p/x'], failed: [], undo: null })).toMatchObject({
      tone: 'done',
      title: 'Folder created',
    });
    expect(opNoticeOf(folder, NOTHING_DONE)).toMatchObject({
      tone: 'failed',
      title: 'The folder couldn’t be created',
    });
    expect(opNoticeOf(trash, NOTHING_DONE)).toMatchObject({
      tone: 'failed',
      title: '2 items couldn’t be moved to Trash',
    });
  });

  it('reports a refused new folder as one failure the notice words as failed', () => {
    const folder = { kind: 'new_folder', in: { place: 'p', folder: 'd' }, name: 'x' } as const;
    const refused = refusedOf(folder, 'No');
    expect(refused).toEqual({ done: [], failed: [{ key: 'p\nd\nx', reason: 'No' }], undo: null });
    expect(opNoticeOf(folder, refused)).toMatchObject({
      tone: 'failed',
      title: 'The folder couldn’t be created',
      reasons: ['No'],
      undo: null,
    });
  });
});

describe('what a source says after an op', () => {
  it('carries it when something was done', () => {
    const restore = { kind: 'restore', nodes: [] } as const;
    const follow = { message: 'Restored as a.txt in Docs', action: null };
    expect(opNoticeOf(restore, { done: ['a'], failed: [], undo: null, follow }).follow).toBe(
      follow,
    );
    expect(opNoticeOf(restore, { done: [], failed: [], undo: null, follow }).follow).toBeNull();
  });
});
