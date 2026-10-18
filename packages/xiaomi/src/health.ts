import { BLUETOOTH_MAC, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { digest, utf8ToBytes } from './bytes';

export const HEALTH_SID = 'miothealth';
export const HEALTH_HOST = 'hlth.io.mi.com';
export const SOURCE_LIST_PATH = '/app/v1/source/get_source_list';
export const HEALTH_USER_AGENT = 'Android-12-9.8.348i-google-Pixel 4';

const PAGE_SIZE = 50;
const BOUND_WEARABLES = 1;

export function sourceListData(): JsonValue {
  return { page_size: PAGE_SIZE, status: BOUND_WEARABLES };
}

const RAW_NONCE = /"nonce"\s*:\s*"?(\d+)"?/;

export function rawNonceOf(loginText: string): string | null {
  return RAW_NONCE.exec(loginText)?.[1] ?? null;
}

export function clientSign(nonce: string, ssecurity: string): string {
  return digest('sha1', utf8ToBytes(`nonce=${nonce}&${ssecurity}`)).toBase64();
}

const AUTH_KEY = z
  .string()
  .trim()
  .toLowerCase()
  .transform((key) => (key.startsWith('0x') ? key.slice(2) : key))
  .pipe(z.string().regex(/^[0-9a-f]{32}$/));

const DETAIL = z.union([
  z.object({ mac: BLUETOOTH_MAC, auth_key: AUTH_KEY }).transform((detail) => ({
    mac: detail.mac,
    authKey: detail.auth_key,
    keyField: 'auth_key',
  })),
  z.object({ mac: BLUETOOTH_MAC, encrypt_key: AUTH_KEY }).transform((detail) => ({
    mac: detail.mac,
    authKey: detail.encrypt_key,
    keyField: 'encrypt_key',
  })),
]);

const DETAIL_TEXT = z.string().transform((text, context): unknown => {
  try {
    return JSON.parse(text);
  } catch (cause) {
    context.addIssue({
      code: 'custom',
      message: `detail should be JSON text, received text that fails to parse (${String(cause)})`,
    });
    return z.NEVER;
  }
});

const SOURCE = z.object({
  name: z.string().trim().min(1),
  model: z.string().trim().min(1).nullish(),
  sid: z.union([z.string(), z.number()]).nullish(),
  detail: z.union([DETAIL_TEXT, z.record(z.string(), z.unknown())]),
});

const SOURCE_LIST = z.object({ list: z.array(z.unknown()).nullish() });

export interface Wearable {
  readonly name: string;
  readonly model: string | null;
  readonly did: string | null;
  readonly mac: string;
  readonly authKey: string;
  readonly keyField: string;
}

export interface SkippedSource {
  readonly fields: string;
  readonly reason: string;
}

export interface SourceList {
  readonly wearables: readonly Wearable[];
  readonly skipped: readonly SkippedSource[];
}

export class HealthSourceListError extends Error {
  override readonly name = 'HealthSourceListError';

  constructor(issues: string) {
    super(`The Mi Fitness cloud answered the device list without a list: ${issues}.`);
  }
}

function fieldsOf(value: unknown): string {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  return parsed.success ? Object.keys(parsed.data).sort().join(', ') : typeof value;
}

function wearableOf(source: unknown): Wearable | SkippedSource {
  const parsed = SOURCE.safeParse(source);
  if (!parsed.success) {
    return { fields: fieldsOf(source), reason: z.prettifyError(parsed.error) };
  }
  const detail = DETAIL.safeParse(parsed.data.detail);
  if (!detail.success) {
    return { fields: fieldsOf(parsed.data.detail), reason: z.prettifyError(detail.error) };
  }
  const { name, model, sid } = parsed.data;
  return {
    name,
    model: model ?? null,
    did: sid === null || sid === undefined ? null : String(sid),
    ...detail.data,
  };
}

export function parseSourceList(result: unknown): SourceList {
  const parsed = SOURCE_LIST.safeParse(result);
  if (!parsed.success) {
    throw new HealthSourceListError(z.prettifyError(parsed.error));
  }
  const read = (parsed.data.list ?? []).map(wearableOf);
  return {
    wearables: read.filter((entry): entry is Wearable => 'mac' in entry),
    skipped: read.filter((entry): entry is SkippedSource => 'reason' in entry),
  };
}
