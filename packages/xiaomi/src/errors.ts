export class MiioPacketError extends Error {
  override readonly name = 'MiioPacketError';

  constructor(
    readonly expected: string,
    readonly received: string,
  ) {
    super(`The miIO packet was refused: expected ${expected}, received ${received}.`);
  }
}

export class MiioDeviceError extends Error {
  override readonly name = 'MiioDeviceError';

  constructor(
    readonly method: string,
    readonly code: number,
    readonly deviceMessage: string,
  ) {
    super(`The device refused ${method} with code ${String(code)}: ${deviceMessage}.`);
  }
}

export class MiotRefusedError extends Error {
  override readonly name = 'MiotRefusedError';

  constructor(
    readonly subject: 'property' | 'action',
    readonly siid: number,
    readonly iid: number,
    readonly code: number,
  ) {
    super(
      `The device answered ${subject} ${String(siid)}.${String(iid)} with code ${String(code)}, expected 0 or 1.`,
    );
  }
}

export class XiaomiCloudError extends Error {
  override readonly name = 'XiaomiCloudError';

  constructor(
    readonly path: string,
    readonly code: number,
    readonly cloudMessage: string,
  ) {
    super(`The Xiaomi cloud refused ${path} with code ${String(code)}: ${cloudMessage}.`);
  }
}

export class XiaomiLoginError extends Error {
  override readonly name = 'XiaomiLoginError';

  constructor(
    readonly step: string,
    readonly expected: string,
    readonly received: string,
  ) {
    super(`Xiaomi sign-in failed at ${step}: expected ${expected}, received ${received}.`);
  }
}

export class MiotSpecError extends Error {
  override readonly name = 'MiotSpecError';

  constructor(
    readonly subject: string,
    readonly expected: string,
    readonly received: string,
  ) {
    super(`The MIoT spec for ${subject} is unusable: expected ${expected}, received ${received}.`);
  }
}

export class MiotValueError extends Error {
  override readonly name = 'MiotValueError';

  constructor(
    readonly subject: string,
    readonly expected: string,
    readonly received: unknown,
  ) {
    super(
      `The value for ${subject} is unusable: expected ${expected}, received ${JSON.stringify(received)}.`,
    );
  }
}
