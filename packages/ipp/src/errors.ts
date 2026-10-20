export class IppDecodeError extends Error {
  override readonly name = 'IppDecodeError';

  constructor(
    readonly offset: number,
    readonly expected: string,
    readonly received: string,
  ) {
    super(
      `IPP message is malformed at byte ${String(offset)}: expected ${expected}, received ${received}`,
    );
  }
}

export class IppEncodeError extends Error {
  override readonly name = 'IppEncodeError';

  constructor(
    readonly field: string,
    readonly expected: string,
    readonly received: string,
  ) {
    super(`IPP ${field} cannot be encoded: expected ${expected}, received ${received}`);
  }
}

export class IppStatusError extends Error {
  override readonly name = 'IppStatusError';

  constructor(
    readonly operation: string,
    readonly status: number,
    readonly statusName: string,
    readonly detail: string | null,
  ) {
    super(
      `${operation} was refused with ${statusName} (0x${status.toString(16).padStart(4, '0')})${
        detail === null ? '' : `: ${detail}`
      }`,
    );
  }
}

export class IppReadError extends Error {
  override readonly name = 'IppReadError';

  constructor(
    readonly attribute: string,
    readonly expected: string,
    readonly received: string,
  ) {
    super(`IPP attribute ${attribute} is not usable: expected ${expected}, received ${received}`);
  }
}
