import { join } from 'node:path';
import type { DriveRootScope } from '@smarteverything/domain';
import { z } from 'zod';
import { PROFILE_ID } from './ids';

export const PERSON_DRIVE_NAMES = z.strictObject({
  parent: z.string().min(1),
  leaf: z.string(),
});

export type PersonDriveNames = z.output<typeof PERSON_DRIVE_NAMES>;

export const DRIVE_FOLDERS = z.strictObject({
  home: z.string().min(1),
  people: PERSON_DRIVE_NAMES,
});

export type DriveFolders = z.output<typeof DRIVE_FOLDERS>;

export class DriveFolderOwnerError extends Error {
  override readonly name = 'DriveFolderOwnerError';

  constructor() {
    super('A personal drive folder needs the profile that owns it.');
  }
}

export function personDriveName(names: PersonDriveNames, profileId: string): string {
  return join(names.parent, PROFILE_ID.parse(profileId), names.leaf);
}

export function driveFolderOf(
  folders: DriveFolders,
  scope: DriveRootScope,
  ownerProfileId: string | null,
): string {
  if (scope === 'home') return folders.home;
  if (ownerProfileId === null) throw new DriveFolderOwnerError();
  return personDriveName(folders.people, ownerProfileId);
}
