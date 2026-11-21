import type { DriveRootScope } from '@smarteverything/domain';

export class DriveSpaceMissingError extends Error {
  override readonly name = 'DriveSpaceMissingError';

  constructor(
    readonly scope: DriveRootScope,
    readonly ownerProfileId: string | null,
  ) {
    super(
      scope === 'home'
        ? 'The Shared Drive does not exist yet; the Hub creates it at start.'
        : `The person ${String(ownerProfileId)} has no drive yet; the Hub creates it with the profile.`,
    );
  }
}
