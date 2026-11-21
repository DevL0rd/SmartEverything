export const DRIVE_SETTINGS_KEY = 'drive';

export class DriveSettingsMissingError extends Error {
  override readonly name = 'DriveSettingsMissingError';

  constructor() {
    super('The drive settings row is missing; the drive storage migration seeds it.');
  }
}
