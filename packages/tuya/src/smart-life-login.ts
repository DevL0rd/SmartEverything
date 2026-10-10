import { z } from 'zod';
import { readFailure, readResult } from './envelope';

export const SMART_LIFE_LOGIN_HOST = 'https://apigw.iotbing.com';

export const SMART_LIFE_CLIENT_ID = 'HA_3y9q4ak7g4ephrvke';

export const SMART_LIFE_SCHEMA = 'haauthorize';

export const SMART_LIFE_QR_PREFIX = 'tuyaSmart--qrLogin?token=';

export const SMART_LIFE_SCAN_PENDING = 'E0020003';

const QR_TOKENS_PATH = '/v1.0/m/life/home-assistant/qrcode/tokens';

export interface SmartLifeSession {
  readonly userCode: string;
  readonly terminalId: string;
  readonly endpoint: string;
  readonly uid: string;
  readonly username: string | null;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
}

export type LoginReply =
  { readonly kind: 'waiting' } | { readonly kind: 'signed_in'; readonly session: SmartLifeSession };

const QR_TOKEN = z.object({
  success: z.literal(true),
  result: z.object({ qrcode: z.string().min(1) }),
});

const SIGNED_IN = z.object({
  success: z.literal(true),
  t: z.number().int().positive(),
  result: z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    expire_time: z.number().int().positive(),
    uid: z.string().min(1),
    terminal_id: z.string().min(1),
    endpoint: z.url(),
    username: z.string().nullish(),
  }),
});

const WAITING = z.object({
  success: z.literal(false),
  code: z.literal(SMART_LIFE_SCAN_PENDING),
});

function loginQuery(userCode: string): URLSearchParams {
  return new URLSearchParams({ clientid: SMART_LIFE_CLIENT_ID, usercode: userCode });
}

export function qrTokenUrl(userCode: string): string {
  const query = loginQuery(userCode);
  query.set('schema', SMART_LIFE_SCHEMA);
  return `${SMART_LIFE_LOGIN_HOST}${QR_TOKENS_PATH}?${query.toString()}`;
}

export function loginResultUrl(qrToken: string, userCode: string): string {
  return `${SMART_LIFE_LOGIN_HOST}${QR_TOKENS_PATH}/${encodeURIComponent(qrToken)}?${loginQuery(userCode).toString()}`;
}

export function qrContent(qrToken: string): string {
  return `${SMART_LIFE_QR_PREFIX}${qrToken}`;
}

function expected<S extends z.ZodType>(operation: string, schema: S, body: unknown): z.output<S> {
  readFailure(operation, body);
  return readResult(operation, schema, body);
}

export function readQrToken(body: unknown): string {
  return expected('requesting a Smart Life QR code', QR_TOKEN, body).result.qrcode;
}

export function readLoginReply(body: unknown, userCode: string): LoginReply {
  if (WAITING.safeParse(body).success) {
    return { kind: 'waiting' };
  }
  const { t, result } = expected('checking the Smart Life QR sign-in', SIGNED_IN, body);
  return {
    kind: 'signed_in',
    session: {
      userCode,
      terminalId: result.terminal_id,
      endpoint: result.endpoint,
      uid: result.uid,
      username: result.username ?? null,
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: t + result.expire_time * 1000,
    },
  };
}
