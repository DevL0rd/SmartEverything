import { md5 } from '@noble/hashes/legacy.js';
import { z } from 'zod';
import { bytesToHex, utf8ToBytes } from './bytes';
import { XiaomiLoginError } from './errors';

export const ACCOUNT_BASE = 'https://account.xiaomi.com';
export const XIAOMI_SID = 'xiaomiio';

const JSON_PREFIX = '&&&START&&&';
const WRONG_CAPTCHA = 87001;
const AUTH_START = '/fe/service/identity/authStart';

const ID = z.union([z.string().min(1), z.number().int()]).transform(String);

const SESSION = z.object({
  code: z.literal(0),
  location: z.string().min(1),
  ssecurity: z.string().min(1),
  passToken: z.string().min(1),
  userId: ID,
  cUserId: z.string().min(1).optional(),
});

const SIGN = z.object({
  _sign: z.string().min(1),
  qs: z.string(),
  callback: z.string(),
  sid: z.string().min(1),
});

const CHALLENGE = z.object({
  code: z.number().int(),
  captchaUrl: z.string().nullish(),
  captchaURL: z.string().nullish(),
  notificationUrl: z.string().nullish(),
  description: z.string().nullish(),
  desc: z.string().nullish(),
});

export type LoginSession = z.infer<typeof SESSION>;

export type LoginSign = z.infer<typeof SIGN>;

export type ServiceLoginReply =
  | { readonly kind: 'session'; readonly session: LoginSession }
  | { readonly kind: 'sign'; readonly sign: LoginSign };

export type LoginAuthReply =
  | { readonly kind: 'session'; readonly session: LoginSession }
  | { readonly kind: 'captcha'; readonly url: string; readonly wrongAnswer: boolean }
  | { readonly kind: 'verify'; readonly notificationUrl: string };

export type VerificationMethod = 'Phone' | 'Email';

const METHOD_BY_FLAG: ReadonlyMap<number, VerificationMethod> = new Map([
  [4, 'Phone'],
  [8, 'Email'],
]);

function shapeOf(reply: unknown): string {
  const parsed = z.record(z.string(), z.unknown()).safeParse(reply);
  return parsed.success
    ? `fields [${Object.keys(parsed.data).sort().join(', ')}]`
    : `a value of type ${typeof reply}`;
}

export function parseLoginJson(step: string, text: string): unknown {
  if (!text.startsWith(JSON_PREFIX)) {
    throw new XiaomiLoginError(step, `a reply starting with ${JSON_PREFIX}`, text.slice(0, 80));
  }
  try {
    return JSON.parse(text.slice(JSON_PREFIX.length));
  } catch (cause) {
    throw new XiaomiLoginError(step, 'JSON after the prefix', String(cause));
  }
}

export function passwordHash(password: string): string {
  return bytesToHex(md5(utf8ToBytes(password))).toUpperCase();
}

export function absoluteAccountUrl(url: string): string {
  return url.startsWith('http') ? url : `${ACCOUNT_BASE}${url}`;
}

export function parseServiceLogin(reply: unknown): ServiceLoginReply {
  const session = SESSION.safeParse(reply);
  if (session.success) {
    return { kind: 'session', session: session.data };
  }
  const sign = SIGN.safeParse(reply);
  if (sign.success) {
    return { kind: 'sign', sign: sign.data };
  }
  throw new XiaomiLoginError('serviceLogin', 'a session or a _sign', shapeOf(reply));
}

function challengeOf(reply: unknown, step: string): z.infer<typeof CHALLENGE> {
  const parsed = CHALLENGE.safeParse(reply);
  if (!parsed.success) {
    const invalid = parsed.error.issues.flatMap((issue) => issue.path.map(String)).join(', ');
    throw new XiaomiLoginError(
      step,
      'a reply with a numeric code',
      `${shapeOf(reply)}, invalid [${invalid}]`,
    );
  }
  return parsed.data;
}

function present(value: string | null | undefined): string | undefined {
  return value === null || value === '' ? undefined : value;
}

function captchaUrlOf(challenge: z.infer<typeof CHALLENGE>): string | undefined {
  return present(challenge.captchaUrl) ?? present(challenge.captchaURL);
}

export function parseLoginAuth(reply: unknown): LoginAuthReply {
  const session = SESSION.safeParse(reply);
  if (session.success) {
    return { kind: 'session', session: session.data };
  }
  const challenge = challengeOf(reply, 'serviceLoginAuth2');
  const captcha = captchaUrlOf(challenge);
  if (captcha !== undefined) {
    return {
      kind: 'captcha',
      url: absoluteAccountUrl(captcha),
      wrongAnswer: challenge.code === WRONG_CAPTCHA,
    };
  }
  const notificationUrl = present(challenge.notificationUrl);
  if (notificationUrl !== undefined) {
    return { kind: 'verify', notificationUrl: absoluteAccountUrl(notificationUrl) };
  }
  throw new XiaomiLoginError(
    'serviceLoginAuth2',
    'a session, a captcha or a verification',
    `code ${String(challenge.code)} ${challenge.description ?? challenge.desc ?? ''}`.trim(),
  );
}

export function identityListUrl(notificationUrl: string): string {
  if (!notificationUrl.includes(AUTH_START)) {
    throw new XiaomiLoginError(
      'identity',
      `a notification URL containing ${AUTH_START}`,
      notificationUrl,
    );
  }
  return notificationUrl.replace(AUTH_START, '/identity/list');
}

export function parseIdentityList(reply: unknown): VerificationMethod {
  const parsed = z
    .object({ flag: z.number().int(), options: z.array(z.number().int()).optional() })
    .safeParse(reply);
  if (!parsed.success) {
    throw new XiaomiLoginError('identity/list', 'a flag', shapeOf(reply));
  }
  const flags = parsed.data.options ?? [parsed.data.flag];
  const method = flags.map((flag) => METHOD_BY_FLAG.get(flag)).find((found) => found !== undefined);
  if (method === undefined) {
    throw new XiaomiLoginError(
      'identity/list',
      'phone (4) or email (8) verification',
      flags.join(', '),
    );
  }
  return method;
}

export function verificationFlag(method: VerificationMethod): string {
  return method === 'Phone' ? '4' : '8';
}

export type SendTicketReply =
  { readonly kind: 'sent' } | { readonly kind: 'captcha'; readonly url: string };

export function parseSendTicket(reply: unknown): SendTicketReply {
  const challenge = challengeOf(reply, 'sendTicket');
  const captcha = captchaUrlOf(challenge);
  if (captcha !== undefined) {
    return { kind: 'captcha', url: absoluteAccountUrl(captcha) };
  }
  if (challenge.code !== 0) {
    throw new XiaomiLoginError('sendTicket', 'code 0', `code ${String(challenge.code)}`);
  }
  return { kind: 'sent' };
}

export function parseVerifyTicket(reply: unknown): string {
  const parsed = z
    .object({ code: z.number().int(), location: z.string().nullish() })
    .safeParse(reply);
  const location = parsed.success ? present(parsed.data.location) : undefined;
  if (!parsed.success || parsed.data.code !== 0 || location === undefined) {
    throw new XiaomiLoginError('verifyTicket', 'code 0 and a location', shapeOf(reply));
  }
  return location;
}
