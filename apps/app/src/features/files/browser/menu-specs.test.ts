import { describe, expect, it } from 'vitest';
import { NO_ABILITIES, abilitiesOf, readOnlyOf } from '../source/abilities';
import { COMPUTER_FULL } from '../source/fixture-seeds';
import { nodeOfEntry } from '../source/fixture-tree';
import type { SourceActionSpec } from '../source/types';
import {
  areaActionsOf,
  builtinActionsOf,
  menuOf,
  menuSectionsOf,
  overflowActionsOf,
} from './menu-specs';

const file = nodeOfEntry({ key: 'f', parentKey: 'p', name: 'a.pdf', mime: 'application/pdf' });
const folder = nodeOfEntry({ key: 'd', parentKey: 'p', name: 'Docs', kind: 'folder' });
const locked = nodeOfEntry({
  key: 'l',
  parentKey: 'p',
  name: 'b.pdf',
  writable: false,
  exportable: false,
});

const attach: SourceActionSpec = {
  id: 'attach',
  label: 'Attach to chat',
  icon: 'paperclip',
  many: true,
  run: () => undefined,
};
const properties: SourceActionSpec = {
  id: 'properties',
  label: 'Properties',
  icon: 'info',
  many: false,
  run: () => undefined,
};

describe('row and selection menus', () => {
  it('offers every built-in action the abilities and the node allow', () => {
    expect(builtinActionsOf([file], { abilities: COMPUTER_FULL, inTrash: false })).toEqual([
      'open',
      'quickLook',
      'details',
      'download',
      'rename',
      'move',
      'copy',
      'trash',
    ]);
  });

  it('hides changes on a read-only source and download, copy on a view-only node', () => {
    expect(
      builtinActionsOf([file], { abilities: readOnlyOf(COMPUTER_FULL), inTrash: false }),
    ).toEqual(['open', 'quickLook', 'details', 'download']);
    expect(builtinActionsOf([locked], { abilities: COMPUTER_FULL, inTrash: false })).toEqual([
      'open',
      'quickLook',
      'details',
    ]);
    expect(builtinActionsOf([file], { abilities: NO_ABILITIES, inTrash: false })).toEqual(['open']);
  });

  it('downloads a folder or several items only when the source zips', () => {
    const noZip = abilitiesOf(['download']);
    expect(builtinActionsOf([folder], { abilities: noZip, inTrash: false })).not.toContain(
      'download',
    );
    expect(
      builtinActionsOf([file, folder], { abilities: COMPUTER_FULL, inTrash: false }),
    ).toContain('download');
  });

  it('offers only restore and delete for good in the Trash', () => {
    expect(builtinActionsOf([file], { abilities: COMPUTER_FULL, inTrash: true })).toEqual([
      'details',
      'restore',
      'deleteNow',
    ]);
  });

  it('stars and unstars by the selection’s marks when the source stars', () => {
    const starred = { ...file, marks: { ...file.marks, starred: true } };
    const abilities = abilitiesOf(['star']);
    expect(builtinActionsOf([starred], { abilities, inTrash: false })).toContain('unstar');
    expect(builtinActionsOf([starred, file], { abilities, inTrash: false })).toContain('star');
  });

  it('groups the menu with source actions before the destructive section', () => {
    const one = menuOf([file], { abilities: COMPUTER_FULL, inTrash: false }, [attach, properties]);
    expect(one.map((item) => item.id).slice(-3)).toEqual(['attach', 'properties', 'trash']);
    const many = menuOf([file, folder], { abilities: COMPUTER_FULL, inTrash: false }, [
      attach,
      properties,
    ]);
    expect(many.map((item) => item.id)).toContain('attach');
    expect(many.map((item) => item.id)).not.toContain('properties');
    expect(many.map((item) => item.id)).not.toContain('rename');
    const sections = menuSectionsOf(one);
    expect(sections.at(-1)?.map((item) => item.id)).toEqual(['trash']);
    expect(sections.at(-1)?.[0]?.destructive).toBe(true);
  });
});

describe('area and overflow actions', () => {
  it('makes Upload the primary and New folder secondary, none in the Trash', () => {
    expect(areaActionsOf(COMPUTER_FULL, false)).toEqual({
      primary: 'upload',
      secondary: ['newFolder'],
    });
    expect(areaActionsOf(abilitiesOf(['newFolder']), false)).toEqual({
      primary: 'newFolder',
      secondary: [],
    });
    expect(areaActionsOf(COMPUTER_FULL, true)).toEqual({ primary: null, secondary: [] });
  });

  it('offers the hidden toggle and path entry only when the source has them', () => {
    expect(overflowActionsOf(COMPUTER_FULL, false)).toEqual(['showHidden', 'enterPath']);
    expect(overflowActionsOf(COMPUTER_FULL, true)).toEqual(['hideHidden', 'enterPath']);
    expect(overflowActionsOf(NO_ABILITIES, false)).toEqual([]);
  });
});
