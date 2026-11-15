import { describe, expect, it } from 'vitest';
import { abilityProblemsOf } from '../../files';
import { driveAbilitiesOf, type DriveAbilityInput } from './drive-abilities';
import { DRIVE_PLACES } from './drive-places';

const OWNER: DriveAbilityInput = {
  place: DRIVE_PLACES.myDrive,
  atTop: true,
  access: 'own',
  online: true,
  phone: false,
};

const roleInput = (access: DriveAbilityInput['access']): DriveAbilityInput => ({
  ...OWNER,
  place: DRIVE_PLACES.sharedWithMe,
  atTop: false,
  access,
});

describe('abilities per role', () => {
  it('gives the owner every change and sharing ability', () => {
    const abilities = driveAbilitiesOf(OWNER);
    expect(abilities).toMatchObject({
      newFolder: true,
      upload: true,
      uploadResume: true,
      rename: true,
      move: true,
      copy: true,
      dragMove: true,
      trash: true,
      trashView: false,
      star: true,
      share: true,
      lock: true,
      comments: true,
      versions: true,
      activity: true,
      shortcuts: true,
      colour: true,
      priority: true,
      searchNames: true,
      searchContents: true,
      download: true,
      downloadZip: true,
      zipContents: true,
      attach: false,
      pathEntry: false,
    });
    expect(abilities.sort).toEqual(['name', 'size', 'modifiedAt']);
    expect(abilityProblemsOf(abilities)).toEqual([]);
  });

  it('lets the shared drive share links and lock but not offer a phone pin without the phone', () => {
    const abilities = driveAbilitiesOf({
      ...OWNER,
      place: DRIVE_PLACES.sharedDrive,
      access: 'shared',
    });
    expect(abilities).toMatchObject({ share: true, lock: true, offline: false });
  });

  it('offers offline pins only where the phone link exists', () => {
    expect(driveAbilitiesOf({ ...OWNER, phone: true }).offline).toBe(true);
    expect(driveAbilitiesOf(OWNER).offline).toBe(false);
  });

  it('lets an editor change items but neither share nor lock them', () => {
    const abilities = driveAbilitiesOf(roleInput('edit'));
    expect(abilities).toMatchObject({
      newFolder: true,
      rename: true,
      trash: true,
      share: false,
      lock: false,
      priority: false,
    });
  });

  it('lets a viewer look, star, copy and download but change nothing', () => {
    const abilities = driveAbilitiesOf(roleInput('view'));
    expect(abilities).toMatchObject({
      newFolder: false,
      upload: false,
      rename: false,
      move: false,
      trash: false,
      dragMove: false,
      star: true,
      copy: true,
      download: true,
      details: true,
      comments: true,
    });
    expect(abilityProblemsOf(abilities)).toEqual([]);
  });

  it('lists the folders shared with the person without searching or creating', () => {
    const abilities = driveAbilitiesOf({ ...roleInput('view'), atTop: true });
    expect(abilities).toMatchObject({
      searchNames: false,
      newFolder: false,
      star: true,
      list: true,
    });
  });
});

describe('abilities per place and state', () => {
  it('limits the trash view to restore and delete forever', () => {
    const abilities = driveAbilitiesOf({ ...OWNER, place: DRIVE_PLACES.trash });
    expect(abilities).toMatchObject({
      trashView: true,
      restore: true,
      deleteNow: true,
      newFolder: false,
      upload: false,
      rename: false,
      download: false,
    });
    expect(abilityProblemsOf(abilities)).toEqual([]);
  });

  it('turns changes, hub features and search off when the app is offline', () => {
    const abilities = driveAbilitiesOf({ ...OWNER, phone: true, online: false });
    expect(abilities).toMatchObject({
      upload: false,
      rename: false,
      share: false,
      lock: false,
      comments: false,
      versions: false,
      activity: false,
      shortcuts: false,
      colour: false,
      offline: false,
      priority: false,
      searchNames: false,
      download: false,
      list: true,
    });
    expect(abilities.quickLook).toEqual([]);
    expect(abilityProblemsOf(abilities)).toEqual([]);
  });
});
