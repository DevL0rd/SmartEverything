import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { XiaomiCloudError } from './errors';
import { parseJson } from './json';

const ENVELOPE = z.object({
  code: z.number().int(),
  message: z.string().optional(),
  result: JSON_VALUE.optional(),
  data: JSON_VALUE.optional(),
});

export interface CloudPayload {
  readonly result: JsonValue;
  readonly data: JsonValue;
}

const EXPIRED_CODES: ReadonlySet<number> = new Set([2, 3]);
const EXPIRED_MESSAGES = ['auth err', 'invalid signature', 'SERVICETOKEN_EXPIRED'];

export function parseCloudEnvelope(path: string, text: string): CloudPayload {
  const body = parseJson(
    text,
    (cause) =>
      new XiaomiCloudError(path, -1, `the reply was not JSON (${cause.split(':', 1).join('')})`),
  );
  const parsed = ENVELOPE.safeParse(body);
  if (!parsed.success) {
    throw new XiaomiCloudError(path, -1, 'the reply had no numeric code');
  }
  const { code, message, result, data } = parsed.data;
  if (code !== 0) {
    throw new XiaomiCloudError(path, code, message ?? 'no message');
  }
  return { result: result ?? null, data: data ?? null };
}

export function isSessionExpired(error: unknown): boolean {
  if (!(error instanceof XiaomiCloudError)) {
    return false;
  }
  return (
    EXPIRED_CODES.has(error.code) ||
    EXPIRED_MESSAGES.some((fragment) => error.cloudMessage.includes(fragment))
  );
}
