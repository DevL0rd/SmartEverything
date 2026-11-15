import { FILE_ABILITIES, type FileAbility } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { abilityProblemsOf } from '../../files';
import {
  abilitiesAtOf,
  computerAbilitiesOf,
  reachedAbilitiesOf,
  type ComputerReachState,
} from './computer-abilities';

const LINUX: readonly FileAbility[] = [...FILE_ABILITIES];

const WINDOWS: readonly FileAbility[] = ['search', 'properties', 'download', 'zip', 'watch'];

function reach(change: Partial<ComputerReachState> = {}): ComputerReachState {
  return { scope: true, online: true, granted: LINUX, ...change };
}

describe('computer file abilities', () => {
  it('gives a Linux computer every change, find, get and look ability', () => {
    const abilities = reachedAbilitiesOf(reach());
    for (const flag of [
      'newFolder',
      'upload',
      'rename',
      'move',
      'copy',
      'dragMove',
      'trash',
      'restore',
      'deleteNow',
      'trashView',
      'searchNames',
      'searchContents',
      'download',
      'downloadZip',
      'attach',
      'zipContents',
      'live',
      'pathEntry',
      'thumbnails',
    ] as const) {
      expect(abilities[flag], flag).toBe(true);
    }
    expect(abilities.sort).toEqual(['name', 'size', 'modifiedAt']);
    expect(abilityProblemsOf(abilities)).toEqual([]);
  });

  it('leaves out every drive only ability', () => {
    const abilities = reachedAbilitiesOf(reach());
    for (const flag of [
      'star',
      'share',
      'comments',
      'versions',
      'activity',
      'shortcuts',
      'colour',
      'offline',
      'lock',
      'priority',
    ] as const) {
      expect(abilities[flag], flag).toBe(false);
    }
  });

  it('keeps a read only computer to browsing, searching and getting files', () => {
    const abilities = reachedAbilitiesOf(reach({ granted: WINDOWS }));
    expect(abilities.newFolder).toBe(false);
    expect(abilities.upload).toBe(false);
    expect(abilities.rename).toBe(false);
    expect(abilities.move).toBe(false);
    expect(abilities.copy).toBe(false);
    expect(abilities.trash).toBe(false);
    expect(abilities.trashView).toBe(false);
    expect(abilities.searchNames).toBe(true);
    expect(abilities.searchContents).toBe(false);
    expect(abilities.download).toBe(true);
    expect(abilities.zipContents).toBe(true);
    expect(abilityProblemsOf(abilities)).toEqual([]);
  });

  it('offers contents search only together with name search', () => {
    const abilities = computerAbilitiesOf(['contents']);
    expect(abilities.searchContents).toBe(false);
    expect(abilityProblemsOf(abilities)).toEqual([]);
  });

  it('drops everything that needs the computer while it is offline', () => {
    const abilities = reachedAbilitiesOf(reach({ online: false }));
    expect(abilities.list).toBe(true);
    expect(abilities.rename).toBe(false);
    expect(abilities.download).toBe(false);
    expect(abilities.searchNames).toBe(false);
    expect(abilities.live).toBe(false);
    expect(abilities.quickLook).toEqual([]);
  });

  it('gives nothing without the files scope', () => {
    const abilities = reachedAbilitiesOf(reach({ scope: false }));
    expect(abilities.list).toBe(false);
    expect(abilities.sort).toEqual([]);
  });

  it('browses with no write ability before the places are known', () => {
    const abilities = reachedAbilitiesOf(reach({ granted: [] }));
    expect(abilities.list).toBe(true);
    expect(abilities.rename).toBe(false);
  });

  it('narrows the Trash view to restoring and deleting for good', () => {
    const abilities = abilitiesAtOf(reachedAbilitiesOf(reach()), true);
    expect(abilities.restore).toBe(true);
    expect(abilities.deleteNow).toBe(true);
    expect(abilities.trashView).toBe(true);
    expect(abilities.upload).toBe(false);
    expect(abilities.newFolder).toBe(false);
    expect(abilities.rename).toBe(false);
    expect(abilities.download).toBe(false);
    expect(abilities.searchNames).toBe(false);
    expect(abilityProblemsOf(abilities)).toEqual([]);
  });
});
