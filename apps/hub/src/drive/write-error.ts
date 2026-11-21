export const DRIVE_WRITE_FAILURES = ['exists', 'missing', 'corrupt'] as const;

export type DriveWriteFailure = (typeof DRIVE_WRITE_FAILURES)[number];

export class DriveWriteError extends Error {
  override readonly name = 'DriveWriteError';

  constructor(
    readonly failure: DriveWriteFailure,
    message: string,
  ) {
    super(message);
  }
}
