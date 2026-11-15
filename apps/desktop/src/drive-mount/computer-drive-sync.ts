export const ENGINE_TIMINGS = {
  changeQuietMs: 1000,
  deleteHoldMs: 3000,
  queueLimit: null,
  writeQuietMs: 2000,
} as const;

export class DriveSyncNotStartedError extends Error {
  override readonly name = 'DriveSyncNotStartedError';

  constructor() {
    super('The sync database is not open');
  }
}
