import { describe, expect, it } from 'vitest';
import type { FileWriteResult } from '@smarteverything/domain';
import {
  baseName,
  doneMessage,
  failureMessage,
  glyphOf,
  joinPath,
  nameError,
  parentOf,
  permissionsWords,
  piecesOf,
  sourceWord,
  trashIdsOf,
  uniqueName,
} from './file-model';

describe('paths', () => {
  it('names, joins and finds parents', () => {
    expect(baseName('/home/dana/notes.txt')).toBe('notes.txt');
    expect(baseName('/')).toBe('/');
    expect(joinPath('/', 'etc')).toBe('/etc');
    expect(joinPath('/home/dana', 'a.txt')).toBe('/home/dana/a.txt');
    expect(parentOf('/home/dana/a.txt')).toBe('/home/dana');
    expect(parentOf('/home')).toBe('/');
  });
});

describe('permissionsWords', () => {
  it('says what you can do in words', () => {
    expect(permissionsWords({ readable: true, writable: true, mode: 0o644 })).toBe(
      'You can read and change it.',
    );
    expect(permissionsWords({ readable: true, writable: false, mode: 0o444 })).toBe(
      'You can only read it.',
    );
    expect(permissionsWords({ readable: false, writable: false, mode: 0 })).toBe(
      'You can’t open it.',
    );
  });
});

describe('uniqueName', () => {
  it('keeps a free name and numbers a taken one before the extension', () => {
    expect(uniqueName('a.txt', new Set())).toBe('a.txt');
    expect(uniqueName('a.txt', new Set(['a.txt']))).toBe('a (2).txt');
    expect(uniqueName('a.txt', new Set(['a.txt', 'a (2).txt']))).toBe('a (3).txt');
    expect(uniqueName('.env', new Set(['.env']))).toBe('.env (2)');
    expect(uniqueName('notes', new Set(['notes']))).toBe('notes (2)');
  });
});

describe('piecesOf', () => {
  it('splits a file into ordered pieces and marks the last', () => {
    expect(piecesOf(10, 4)).toEqual([
      { start: 0, end: 4, final: false },
      { start: 4, end: 8, final: false },
      { start: 8, end: 10, final: true },
    ]);
    expect(piecesOf(8, 4).at(-1)).toEqual({ start: 4, end: 8, final: true });
  });

  it('sends an empty file as one final piece', () => {
    expect(piecesOf(0)).toEqual([{ start: 0, end: 0, final: true }]);
  });
});

describe('messages', () => {
  const result: FileWriteResult = {
    done: [
      { path: '/a', newPath: null, trashId: 't1' },
      { path: '/b', newPath: null, trashId: 't2' },
    ],
    failed: [],
  };

  it('counts the items moved to Trash and offers their ids for Undo', () => {
    expect(doneMessage({ action: 'trash', paths: ['/a', '/b'] }, result)).toBe(
      'Moved 2 items to Trash',
    );
    expect(trashIdsOf(result)).toEqual(['t1', 't2']);
  });

  it('says nothing when nothing was done and names the failure', () => {
    expect(doneMessage({ action: 'trash', paths: ['/a'] }, { done: [], failed: [] })).toBeNull();
    expect(failureMessage({ action: 'trash', paths: ['/a'] }, '/x/a.txt', 'No permission')).toBe(
      'a.txt wasn’t moved to Trash: No permission',
    );
  });

  it('names the destination of a move', () => {
    expect(
      doneMessage({ action: 'move', paths: ['/a'], to: '/home/dana/Docs', replace: false }, result),
    ).toBe('Moved 2 items to Docs');
  });
});

describe('glyphOf', () => {
  it('picks the icon from the kind and the extension', () => {
    expect(glyphOf({ kind: 'folder', name: 'a' })).toBe('folder');
    expect(glyphOf({ kind: 'link', name: 'a' })).toBe('link');
    expect(glyphOf({ kind: 'file', name: 'Photo.JPG' })).toBe('image');
    expect(glyphOf({ kind: 'file', name: 'png' })).toBe('fileText');
    expect(glyphOf({ kind: 'file', name: 'notes.txt' })).toBe('fileText');
  });
});

describe('nameError', () => {
  it('accepts plain names and explains refusals', () => {
    expect(nameError('')).toBeNull();
    expect(nameError('notes v2.txt')).toBeNull();
    expect(nameError('a/b')).not.toBeNull();
    expect(nameError('..')).not.toBeNull();
    expect(nameError('x'.repeat(256))).not.toBeNull();
  });
});

describe('upload wording', () => {
  it('names where the files come from', () => {
    expect(sourceWord(true)).toBe('this phone');
    expect(sourceWord(false)).toBe('this device');
  });
});
