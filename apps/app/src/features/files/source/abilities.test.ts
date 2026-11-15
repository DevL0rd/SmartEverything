import { describe, expect, it } from 'vitest';
import {
  FLAG_ABILITIES,
  NO_ABILITIES,
  abilitiesOf,
  abilityProblemsOf,
  grantedOf,
  offlineOf,
  readOnlyOf,
} from './abilities';
import { COMPUTER_FULL } from './fixture-seeds';

describe('abilities', () => {
  it('grants exactly the listed flags', () => {
    const abilities = abilitiesOf(['list', 'move'], { sort: ['name'] });
    expect(grantedOf(abilities)).toEqual(['list', 'move']);
    expect(abilities.sort).toEqual(['name']);
    expect(grantedOf(NO_ABILITIES)).toEqual([]);
    expect(FLAG_ABILITIES.every((flag) => typeof NO_ABILITIES[flag] === 'boolean')).toBe(true);
  });

  it('finds abilities that need another one', () => {
    expect(abilityProblemsOf(abilitiesOf(['dragMove', 'uploadResume']))).toEqual([
      { ability: 'uploadResume', needs: 'upload' },
      { ability: 'dragMove', needs: 'move' },
    ]);
    expect(abilityProblemsOf(abilitiesOf([], { sort: ['size'] }))).toEqual([
      { ability: 'sort', needs: 'name' },
    ]);
    expect(abilityProblemsOf(abilitiesOf([], { quickLook: ['folder'] }))).toEqual([
      { ability: 'quickLook', needs: 'files' },
    ]);
    expect(abilityProblemsOf(COMPUTER_FULL)).toEqual([]);
  });

  it('keeps reading but drops every change for a read-only place', () => {
    const readOnly = readOnlyOf(COMPUTER_FULL);
    expect(grantedOf(readOnly)).not.toEqual(expect.arrayContaining(['rename']));
    expect([
      readOnly.upload,
      readOnly.move,
      readOnly.trash,
      readOnly.trashView,
      readOnly.newFolder,
    ]).toEqual([false, false, false, false, false]);
    expect([readOnly.copy, readOnly.download, readOnly.searchContents]).toEqual([
      false,
      true,
      true,
    ]);
    expect(abilityProblemsOf(readOnly)).toEqual([]);
  });

  it('keeps only browsing the cached listing while offline', () => {
    const offline = offlineOf(COMPUTER_FULL);
    expect([offline.list, offline.grid, offline.sort.length > 0]).toEqual([true, true, true]);
    expect([offline.download, offline.searchNames, offline.thumbnails, offline.live]).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(offline.quickLook).toEqual([]);
    expect(abilityProblemsOf(offline)).toEqual([]);
  });
});
