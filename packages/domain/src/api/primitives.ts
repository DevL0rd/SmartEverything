import { z } from 'zod';
import { JSON_VALUE } from '../values';

export const ID = z.uuid();

export const MOMENT = z.iso.datetime({ offset: true });

export const DAY = z.iso.date('must be a day written YYYY-MM-DD, such as 2026-10-10');

export const FLAG = z.boolean();

export const JSON_OBJECT = z.record(z.string(), JSON_VALUE);

export const JSON_LIST = z.array(JSON_VALUE);

export function boundedText(longest: number): z.ZodString {
  return z.string().trim().min(1).max(longest);
}

export const POSITION = z.int().min(0).max(1_000_000);

export const COUNT = z.int().min(0);

export const SEQ = z.int().min(0);

export const ROLES = ['owner', 'member'] as const;

export const ROLE = z.enum(ROLES);

export type Role = z.infer<typeof ROLE>;

export const CLIENT_PLATFORMS = ['desktop', 'android', 'web'] as const;

export const CLIENT_PLATFORM = z.enum(CLIENT_PLATFORMS);

export const ICE_SERVER = z.strictObject({
  urls: z.array(z.string().regex(/^(stun|turns?):\S+$/, 'a stun:, turn: or turns: URL')).min(1),
  username: z.string().min(1).optional(),
  credential: z.string().min(1).optional(),
});

export type IceServer = z.infer<typeof ICE_SERVER>;

export const WEBRTC_CANDIDATE = z
  .string()
  .regex(/^[^\s:]+(:\d{1,5})?$/, 'a host, an address or host:port');

export const HTTPS_URL = z.url({ protocol: /^https$/ }).refine((url) => !url.includes('?'), {
  message: 'must not carry a query',
});

export function queryList<T extends z.ZodType<unknown, string>>(
  item: T,
): z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string[], string>>, z.ZodArray<T>> {
  return z
    .string()
    .transform((text) => text.split(','))
    .pipe(z.array(item).min(1));
}

export const QUERY_IDS = queryList(ID);

export const TIME_WINDOW = {
  from: MOMENT.optional(),
  to: MOMENT.optional(),
  deviceIds: queryList(ID).optional(),
};

export const QUERY_NAMES = queryList(z.string().min(1).max(120));

export function somethingToChange<T extends z.ZodRawShape>(
  shape: T,
): z.ZodObject<{ -readonly [K in keyof T]: z.ZodOptional<T[K]> }, z.core.$strict> {
  return z
    .strictObject(shape)
    .partial()
    .refine((patch) => Object.keys(patch).length > 0, {
      message: 'name at least one field to change',
    });
}

export function queryLimit(standard: number, largest: number): z.ZodDefault<z.ZodCoercedNumber> {
  return z.coerce.number().int().min(1).max(largest).default(standard);
}

export const QUERY_FLAG = z.enum(['true', 'false']).transform((text) => text === 'true');

export const NOTHING = z.strictObject({});

export const DONE = z.strictObject({ ok: z.literal(true) });

export type Done = z.infer<typeof DONE>;
