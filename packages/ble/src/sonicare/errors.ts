export class SonicareFrameError extends Error {
  override readonly name = 'SonicareFrameError';

  constructor(
    readonly characteristic: string,
    readonly expected: string,
    readonly received: string,
  ) {
    super(
      `Sonicare frame on ${characteristic} is unreadable: expected ${expected}, received ${received}.`,
    );
  }
}

export class CondorFramingError extends Error {
  override readonly name = 'CondorFramingError';

  constructor(
    readonly reason: string,
    readonly received: string,
  ) {
    super(`Condor framing failed: ${reason} (received ${received}).`);
  }
}

export class SonicareRefusedError extends Error {
  override readonly name = 'SonicareRefusedError';
}
