import { describe, expect, it } from 'vitest';
import { abilitiesOf, readOnlyOf } from '../source/abilities';
import { COMPUTER_FULL } from '../source/fixture-seeds';
import { nodeOfEntry } from '../source/fixture-tree';
import type { SourceActionSpec } from '../source/types';
import { columnsOf, hasPeople, layoutOf, rowActionsOf, selectionActionsOf } from './column-model';

const file = nodeOfEntry({ key: 'f', parentKey: 'p', name: 'a.pdf', mime: 'application/pdf' });
const image = nodeOfEntry({ key: 'i', parentKey: 'p', name: 'b.jpg', mime: 'image/jpeg' });
const folder = nodeOfEntry({ key: 'd', parentKey: 'p', name: 'Docs', kind: 'folder' });
const shared = nodeOfEntry({ key: 's', parentKey: 'p', name: 'c.txt', byProfileId: 'alex' });

const attach: SourceActionSpec = {
  id: 'attach',
  label: 'Attach to chat',
  icon: 'paperclip',
  many: true,
  run: () => undefined,
};

const drive = abilitiesOf(['list', 'details', 'download', 'downloadZip', 'star', 'trash'], {
  sort: ['name', 'by', 'size', 'modifiedAt'],
  quickLook: ['image'],
});

const ids = (specs: readonly { readonly id: string }[]): readonly string[] =>
  specs.map((spec) => spec.id);

describe('layout and columns', () => {
  it('uses rows under 600 px and a table from 600 px unless compact', () => {
    expect(layoutOf(412, false)).toBe('rows');
    expect(layoutOf(600, false)).toBe('table');
    expect(layoutOf(1440, true)).toBe('rows');
  });

  it('adds the By column only when the source has people', () => {
    expect(columnsOf(COMPUTER_FULL, hasPeople(COMPUTER_FULL, [file])).map((c) => c.field)).toEqual([
      'name',
      'size',
      'modifiedAt',
    ]);
    expect(hasPeople(COMPUTER_FULL, [shared])).toBe(true);
    expect(columnsOf(drive, hasPeople(drive, [])).map((c) => c.field)).toEqual([
      'name',
      'by',
      'size',
      'modifiedAt',
    ]);
  });

  it('makes a column sortable only when the source sorts by it', () => {
    const columns = columnsOf(abilitiesOf(['list'], { sort: ['name'] }), true);
    expect(columns.map((column) => [column.field, column.sortable])).toEqual([
      ['name', true],
      ['by', false],
      ['size', false],
      ['modifiedAt', false],
    ]);
  });
});

describe('row actions', () => {
  it('offers every action of a full computer place in group order', () => {
    const actions = rowActionsOf(file, { abilities: COMPUTER_FULL, inTrash: false }, [attach]);
    expect(ids(actions.menu)).toEqual([
      'open',
      'quickLook',
      'details',
      'download',
      'rename',
      'move',
      'copy',
      'attach',
      'trash',
    ]);
    expect(ids(actions.quick)).toEqual(['download']);
  });

  it('keeps only the reading actions in a read-only place', () => {
    const actions = rowActionsOf(
      file,
      { abilities: readOnlyOf(COMPUTER_FULL), inTrash: false },
      [],
    );
    expect(ids(actions.menu)).toEqual(['open', 'quickLook', 'details', 'download']);
  });

  it('puts star and download in the quick row for Drive and leaves Quick look to kinds it plays', () => {
    const actions = rowActionsOf(image, { abilities: drive, inTrash: false }, []);
    expect(ids(actions.menu)).toEqual([
      'open',
      'quickLook',
      'details',
      'download',
      'star',
      'trash',
    ]);
    expect(ids(actions.quick)).toEqual(['download', 'star']);
    expect(ids(rowActionsOf(file, { abilities: drive, inTrash: false }, []).menu)).not.toContain(
      'quickLook',
    );
  });

  it('offers restore and delete for good in Trash and no source actions', () => {
    const actions = rowActionsOf(file, { abilities: COMPUTER_FULL, inTrash: true }, []);
    expect(ids(actions.menu)).toEqual(['details', 'restore', 'deleteNow']);
  });
});

describe('selection bar actions', () => {
  it('drops the one-item actions and separates the destructive ones', () => {
    const bar = selectionActionsOf([file, folder], { abilities: COMPUTER_FULL, inTrash: false }, [
      attach,
    ]);
    expect(ids(bar.actions)).toEqual(['download', 'move', 'copy', 'attach']);
    expect(ids(bar.danger)).toEqual(['trash']);
  });

  it('offers no zip download when the source cannot zip', () => {
    const noZip = { ...COMPUTER_FULL, downloadZip: false };
    const bar = selectionActionsOf([file, image], { abilities: noZip, inTrash: false }, []);
    expect(ids(bar.actions)).not.toContain('download');
  });

  it('offers restore beside delete for good in Trash', () => {
    const bar = selectionActionsOf([file], { abilities: COMPUTER_FULL, inTrash: true }, []);
    expect(ids(bar.actions)).toEqual(['restore']);
    expect(ids(bar.danger)).toEqual(['deleteNow']);
  });
});
