export class UpdateVerificationError extends Error {
  override readonly name = 'UpdateVerificationError';

  constructor(
    readonly file: string,
    expected: string,
    received: string,
  ) {
    super(`The downloaded ${file} must be ${expected}; received ${received}`);
  }
}

export class UpdateServerRefusedError extends Error {
  override readonly name = 'UpdateServerRefusedError';

  constructor(
    readonly what: string,
    readonly status: number,
  ) {
    super(`The home refused ${what} with status ${String(status)}`);
  }
}

export class UpdateInstallError extends Error {
  override readonly name = 'UpdateInstallError';

  constructor(
    readonly step: string,
    reason: string,
  ) {
    super(`The update stopped while ${step}: ${reason}`);
  }
}
