import { z } from 'zod';

export const TUYA_ERROR_KINDS = [
  'credentials',
  'token',
  'permission',
  'device_offline',
  'refused',
  'unsupported_device',
  'other',
] as const;

export type TuyaErrorKind = (typeof TUYA_ERROR_KINDS)[number];

const KNOWN_CODES: ReadonlyMap<number, TuyaErrorKind> = new Map([
  [1004, 'credentials'],
  [1010, 'token'],
  [1106, 'permission'],
  [2001, 'device_offline'],
  [2008, 'refused'],
  [2009, 'unsupported_device'],
]);

export type TuyaErrorCode = number | string;

export function errorKindOf(code: TuyaErrorCode): TuyaErrorKind {
  return KNOWN_CODES.get(typeof code === 'number' ? code : Number(code)) ?? 'other';
}

const FAILURE = z.object({
  success: z.literal(false),
  code: z.union([z.number().int(), z.string().min(1)]),
  msg: z.string().default(''),
});

const SUCCESS = z.object({ success: z.literal(true), result: z.unknown() });

export class TuyaCloudError extends Error {
  override readonly name = 'TuyaCloudError';
  readonly kind: TuyaErrorKind;

  constructor(
    readonly operation: string,
    readonly code: TuyaErrorCode,
    readonly detail: string,
  ) {
    super(`Tuya cloud refused ${operation}: code ${String(code)}, "${detail}".`);
    this.kind = errorKindOf(code);
  }
}

export class TuyaResponseError extends Error {
  override readonly name = 'TuyaResponseError';

  constructor(
    readonly operation: string,
    readonly problems: string,
  ) {
    super(
      `Tuya cloud answered ${operation} with a body that is not a success or failure envelope of the expected shape: ${problems}.`,
    );
  }
}

export function readFailure(operation: string, body: unknown): void {
  const failure = FAILURE.safeParse(body);
  if (failure.success) {
    throw new TuyaCloudError(operation, failure.data.code, failure.data.msg);
  }
}

export function readResult<S extends z.ZodType>(
  operation: string,
  result: S,
  candidate: unknown,
): z.output<S> {
  const parsed = result.safeParse(candidate);
  if (!parsed.success) {
    throw new TuyaResponseError(operation, z.prettifyError(parsed.error));
  }
  return parsed.data;
}

export function readEnvelope<S extends z.ZodType>(
  operation: string,
  result: S,
  body: unknown,
): z.output<S> {
  readFailure(operation, body);
  const envelope = SUCCESS.safeParse(body);
  if (!envelope.success) {
    throw new TuyaResponseError(operation, z.prettifyError(envelope.error));
  }
  return readResult(operation, result, envelope.data.result);
}
