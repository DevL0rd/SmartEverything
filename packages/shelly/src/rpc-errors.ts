export class ShellyRpcError extends Error {
  override readonly name = 'ShellyRpcError';
  constructor(
    readonly method: string,
    readonly code: number,
    readonly reason: string,
  ) {
    super(`Shelly refused ${method} with error ${String(code)}: ${reason}.`);
  }
}

export class ShellyConnectionError extends Error {
  override readonly name = 'ShellyConnectionError';
  constructor(
    readonly operation: string,
    readonly reason: string,
    cause?: unknown,
  ) {
    super(`Shelly ${operation} failed: ${reason}.`, { cause });
  }
}

export class ShellyAuthenticationError extends Error {
  override readonly name = 'ShellyAuthenticationError';
  constructor(
    readonly reason: string,
    cause?: unknown,
  ) {
    super(`Shelly local authentication failed: ${reason}.`, { cause });
  }
}
