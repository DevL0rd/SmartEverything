import { z } from 'zod';

const DPS_PAYLOAD = z.object({
  dps: z.record(z.string(), z.unknown()),
  cid: z.string().min(1).optional(),
});

export type LocalPayload =
  | {
      readonly kind: 'dps';
      readonly dps: Readonly<Record<string, unknown>>;
      readonly cid: string | null;
    }
  | { readonly kind: 'key_mismatch' }
  | { readonly kind: 'device_message'; readonly text: string }
  | { readonly kind: 'empty' };

const PRINTABLE = /^[\x20-\x7e]*$/;

export function classifyLocalPayload(payload: unknown): LocalPayload {
  if (typeof payload === 'string') {
    return PRINTABLE.test(payload)
      ? { kind: 'device_message', text: payload }
      : { kind: 'key_mismatch' };
  }
  const parsed = DPS_PAYLOAD.safeParse(payload);
  if (!parsed.success) {
    return { kind: 'empty' };
  }
  return { kind: 'dps', dps: parsed.data.dps, cid: parsed.data.cid ?? null };
}

export function isKeyMismatchError(message: string): boolean {
  return message.startsWith('HMAC mismatch');
}

export const LOCAL_KEY_LENGTH = 16;

export function isUsableLocalKey(key: string | null): key is string {
  return key !== null && key.length === LOCAL_KEY_LENGTH;
}
