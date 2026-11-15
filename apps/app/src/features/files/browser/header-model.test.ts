import { describe, expect, it } from 'vitest';
import { NO_ABILITIES, abilitiesOf, readOnlyOf } from '../source/abilities';
import { COMPUTER_FULL } from '../source/fixture-seeds';
import { nodeOfEntry } from '../source/fixture-tree';
import type { FilePlace } from '../source/types';
import { headerModelOf, readOnlyPlace, type HeaderModelInput } from './header-model';

const home: FilePlace = {
  key: '/home/dana',
  label: 'Home',
  kind: 'home',
  location: { place: '/home/dana', folder: null },
};
const trash: FilePlace = { ...home, key: 'trash', label: 'Trash', kind: 'trash' };
const projects = nodeOfEntry({
  key: '/home/dana/Projects',
  parentKey: '/home/dana',
  name: 'Projects',
  kind: 'folder',
});

const base: HeaderModelInput = {
  sourceLabel: 'Workstation',
  place: home,
  folder: null,
  crumbs: [],
  total: 7,
  abilities: COMPUTER_FULL,
  offline: false,
};

describe('header contribution', () => {
  it('names the place, counts the items and makes Upload the area primary', () => {
    expect(headerModelOf(base)).toEqual({
      title: 'Home',
      subtitle: '7 items',
      area: { primary: 'upload', secondary: ['newFolder'] },
    });
  });

  it('titles an open folder with its name', () => {
    expect(headerModelOf({ ...base, folder: projects }).title).toBe('Projects');
  });

  it('falls back to the source label without a place', () => {
    expect(headerModelOf({ ...base, place: null, total: null }).title).toBe('Workstation');
  });

  it('says Read only and offers nothing to add when the place cannot change', () => {
    const model = headerModelOf({ ...base, abilities: readOnlyOf(COMPUTER_FULL) });
    expect(model.subtitle).toBe('7 items · Read only');
    expect(model.area).toEqual({ primary: null, secondary: [] });
  });

  it('says Offline and drops the area actions while offline', () => {
    const model = headerModelOf({ ...base, offline: true });
    expect(model.subtitle).toBe('7 items · Offline');
    expect(model.area.primary).toBeNull();
  });

  it('offers nothing to add in Trash and does not call it read only', () => {
    const model = headerModelOf({ ...base, place: trash, total: 2 });
    expect(model).toEqual({
      title: 'Trash',
      subtitle: '2 items',
      area: { primary: null, secondary: [] },
    });
  });

  it('keeps New folder alone as the primary when uploads are not allowed', () => {
    const abilities = abilitiesOf(['list', 'newFolder']);
    expect(headerModelOf({ ...base, abilities }).area).toEqual({
      primary: 'newFolder',
      secondary: [],
    });
  });

  it('treats a view-only folder as read only', () => {
    const locked = { ...projects, writable: false, marks: { ...projects.marks, locked: true } };
    const model = headerModelOf({ ...base, folder: locked });
    expect(model.subtitle).toBe('7 items · View only · Read only');
    expect(model.area.primary).toBeNull();
  });

  it('does not call a refused place read only', () => {
    expect(readOnlyPlace(NO_ABILITIES, null)).toBe(false);
  });
});
