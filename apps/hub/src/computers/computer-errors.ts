import {
  ApiError,
  COMPUTER_SCOPE_OFF,
  type ApiErrorCode,
  type ComputerScope,
  type NodeFailureCode,
} from '@smarteverything/domain';
import { NodeCallError } from './node-calls';

export class ComputerOfflineError extends Error {
  override readonly name = 'ComputerOfflineError';

  constructor() {
    super('This computer is offline.');
  }
}

export class NotAComputerError extends Error {
  override readonly name = 'NotAComputerError';

  constructor() {
    super('That device is not a computer.');
  }
}

export class ComputerScopeOffError extends Error {
  override readonly name = 'ComputerScopeOffError';

  constructor(readonly scope: ComputerScope) {
    super(COMPUTER_SCOPE_OFF[scope]);
  }
}

export class ComputerCommandUnsupportedError extends Error {
  override readonly name = 'ComputerCommandUnsupportedError';

  constructor(capability: string) {
    super(`Computers cannot do “${capability}”.`);
  }
}

const CODES: Readonly<Record<NodeFailureCode, ApiErrorCode>> = {
  scope_off: 'forbidden',
  not_supported: 'conflict',
  not_permitted: 'forbidden',
  blocked: 'conflict',
  not_found: 'not_found',
  not_own: 'forbidden',
  no_session: 'conflict',
  failed: 'upstream_failed',
};

export function apiErrorOf(cause: unknown): unknown {
  if (cause instanceof NodeCallError) {
    return new ApiError(CODES[cause.code], cause.message);
  }
  if (cause instanceof ComputerOfflineError) {
    return new ApiError('conflict', cause.message);
  }
  if (cause instanceof NotAComputerError) {
    return new ApiError('not_found', cause.message);
  }
  if (cause instanceof ComputerScopeOffError) {
    return new ApiError('forbidden', cause.message);
  }
  return cause;
}
