import { describe, expect, it } from 'vitest';
import { folderState, kindChip, kindText, orderedFolders } from './folder-model';
import { folderOf } from './snapshot-fixture';

describe('folderState', () => {
  it('checks off a folder with nothing left', () => {
    expect(folderState(folderOf())).toEqual({
      tone: 'positive',
      glyph: 'check',
      text: 'Up to date',
      percent: 100,
    });
  });

  it('shows progress and bytes left while syncing, without a check', () => {
    const state = folderState(folderOf({ completionPercent: 62.4, needBytes: 1_500_000_000 }));
    expect(state).toMatchObject({ tone: 'info', glyph: null, percent: 62 });
    expect(state.text).toBe('62 % · 1.5 GB left');
  });

  it('keeps a nearly finished folder off the check', () => {
    const state = folderState(folderOf({ completionPercent: 99.8, needBytes: 4_000 }));
    expect(state.glyph).toBeNull();
    expect(state.percent).toBe(99);
  });

  it('puts failures before pause and progress', () => {
    const failed = folderOf({ errorCount: 2, paused: true, completionPercent: 40, needBytes: 9 });
    expect(folderState(failed)).toMatchObject({ tone: 'critical', text: '2 failed' });
  });

  it('says paused', () => {
    expect(folderState(folderOf({ paused: true }))).toMatchObject({
      tone: 'warning',
      glyph: 'pause',
      text: 'Paused',
    });
  });

  it('names local changes on a folder that is otherwise done', () => {
    expect(folderState(folderOf({ localChanges: 3 }))).toMatchObject({
      glyph: 'pencil',
      text: '3 local changes',
      percent: 100,
    });
    expect(folderState(folderOf({ localChanges: 1 })).text).toBe('1 local change');
  });
});

describe('kind words', () => {
  it('chips only the non-default kinds', () => {
    expect(kindChip(folderOf())).toBeNull();
    expect(kindChip(folderOf({ type: 'sendonly' }))).toBe('Send only');
    expect(kindChip(folderOf({ type: 'receiveonly' }))).toBe('Receive only');
    expect(kindChip(folderOf({ type: 'receiveencrypted' }))).toBe('Encrypted');
  });

  it('spells every kind in the sheet', () => {
    expect(kindText(folderOf())).toBe('Send and receive');
    expect(kindText(folderOf({ type: 'receiveencrypted' }))).toBe('Receive encrypted');
  });
});

describe('orderedFolders', () => {
  it('lists failing folders first, then syncing, then the rest by name', () => {
    const folders = [
      folderOf({ id: 'z', label: 'Zeta' }),
      folderOf({ id: 'a', label: 'Alpha' }),
      folderOf({ id: 'sync', label: 'Music', completionPercent: 10, needBytes: 9 }),
      folderOf({ id: 'bad', label: 'Work', errorCount: 1 }),
      folderOf({ id: 'paused', label: 'Beta', paused: true, completionPercent: 10, needBytes: 9 }),
    ];
    expect(orderedFolders(folders).map((folder) => folder.id)).toEqual([
      'bad',
      'sync',
      'a',
      'paused',
      'z',
    ]);
  });

  it('does not change the order it was given', () => {
    const folders = [folderOf({ label: 'B' }), folderOf({ id: 'a', label: 'A' })];
    orderedFolders(folders);
    expect(folders[0]?.label).toBe('B');
  });
});
