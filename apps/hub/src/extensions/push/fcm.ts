import { sign } from 'node:crypto';
import type { PushServiceAccount } from '@smarteverything/domain';
import { z } from 'zod';
import type { PushDelivery } from './commands';

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

const ASSERTION_LIFETIME_S = 3600;

const EXPIRY_MARGIN_MS = 60_000;

const REQUEST_TIMEOUT_MS = 15_000;

const TOKEN_RESPONSE = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

const FCM_ERROR = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().default(''),
    status: z.string().default(''),
    details: z
      .array(
        z.looseObject({
          '@type': z.string().optional(),
          errorCode: z.string().optional(),
          fieldViolations: z.array(z.object({ field: z.string().optional() })).optional(),
        }),
      )
      .default([]),
  }),
});

export interface PushNotification {
  readonly title: string;
  readonly body: string;
  readonly data: Readonly<Record<string, string>>;
  readonly dataOnly?: boolean;
}

type FcmMessage = Readonly<Record<string, unknown>>;

function messageOf(token: string, notification: PushNotification): FcmMessage {
  if (notification.dataOnly === true) {
    return {
      token,
      data: { ...notification.data, title: notification.title, message: notification.body },
      android: { priority: 'HIGH' },
    };
  }
  return {
    token,
    notification: { title: notification.title, body: notification.body },
    data: notification.data,
    android: { priority: 'HIGH', notification: { sound: 'default' } },
  };
}

export type Delivery =
  | { readonly outcome: 'sent' }
  | { readonly outcome: 'stale'; readonly reason: string }
  | { readonly outcome: 'failed'; readonly reason: string };

class PushAuthorizationError extends Error {
  override readonly name = 'PushAuthorizationError';

  constructor(readonly reason: string) {
    super(`Google refused the Firebase service account: ${reason}.`);
  }
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function assertionFor(account: PushServiceAccount, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: FCM_SCOPE,
      aud: account.token_uri,
      iat: issuedAt,
      exp: issuedAt + ASSERTION_LIFETIME_S,
    }),
  );
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), account.private_key);
  return `${header}.${claims}.${base64Url(signature)}`;
}

async function textOf(response: Response): Promise<string> {
  return (await response.text()).slice(0, 2000);
}

function jsonOf(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (cause) {
    return { notJson: text, cause: String(cause) };
  }
}

export function deliveryOf(status: number, text: string): Delivery {
  const parsed = FCM_ERROR.safeParse(jsonOf(text));
  if (!parsed.success) {
    return { outcome: 'failed', reason: `HTTP ${String(status)} ${text}` };
  }
  const { message, details } = parsed.data.error;
  const codes = details.flatMap((detail) =>
    detail.errorCode === undefined ? [] : [detail.errorCode],
  );
  const errorStatus = codes[0] ?? parsed.data.error.status;
  const reason = `HTTP ${String(status)} ${errorStatus}: ${message}`;
  const tokenViolation = details.some((detail) =>
    (detail.fieldViolations ?? []).some((violation) => violation.field === 'message.token'),
  );
  const stale =
    codes.includes('UNREGISTERED') ||
    (errorStatus === 'INVALID_ARGUMENT' && (tokenViolation || /registration token/i.test(message)));
  return stale ? { outcome: 'stale', reason } : { outcome: 'failed', reason };
}

interface CachedToken {
  readonly identity: string;
  readonly token: string;
  readonly expiresAt: number;
}

export class FcmClient {
  private cached: CachedToken | null = null;
  private issuing: Promise<string> | null = null;

  constructor(
    private readonly fetch: typeof globalThis.fetch,
    private readonly now: () => Date,
  ) {}

  send(
    account: PushServiceAccount,
    token: string,
    notification: PushNotification,
  ): Promise<Delivery> {
    return this.deliver(account, messageOf(token, notification));
  }

  sendData(
    account: PushServiceAccount,
    token: string,
    data: Readonly<Record<string, string>>,
    delivery: PushDelivery,
  ): Promise<Delivery> {
    return this.deliver(account, {
      token,
      data,
      android: {
        priority: 'HIGH',
        ttl: `${String(delivery.ttlSeconds)}s`,
        ...(delivery.collapseKey === null ? {} : { collapse_key: delivery.collapseKey }),
      },
    });
  }

  private async deliver(account: PushServiceAccount, message: FcmMessage): Promise<Delivery> {
    const first = await this.attempt(account, message);
    if (first.status !== 401) {
      return first.status < 300 ? { outcome: 'sent' } : deliveryOf(first.status, first.text);
    }
    this.cached = null;
    const second = await this.attempt(account, message);
    return second.status < 300 ? { outcome: 'sent' } : deliveryOf(second.status, second.text);
  }

  private async attempt(
    account: PushServiceAccount,
    message: FcmMessage,
  ): Promise<{ status: number; text: string }> {
    const response = await this.fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await this.accessToken(account)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    return { status: response.status, text: await textOf(response) };
  }

  private accessToken(account: PushServiceAccount): Promise<string> {
    const identity = JSON.stringify([account.client_email, account.token_uri, account.private_key]);
    if (this.cached?.identity === identity && this.cached.expiresAt > this.now().getTime()) {
      return Promise.resolve(this.cached.token);
    }
    this.issuing ??= this.issue(account, identity).finally(() => {
      this.issuing = null;
    });
    return this.issuing;
  }

  private async issue(account: PushServiceAccount, identity: string): Promise<string> {
    const nowMs = this.now().getTime();
    const response = await this.fetch(account.token_uri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: assertionFor(account, this.now()),
      }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await textOf(response);
    const parsed = TOKEN_RESPONSE.safeParse(jsonOf(text));
    if (!response.ok || !parsed.success) {
      throw new PushAuthorizationError(`HTTP ${String(response.status)} ${text}`);
    }
    this.cached = {
      identity,
      token: parsed.data.access_token,
      expiresAt: nowMs + parsed.data.expires_in * 1000 - EXPIRY_MARGIN_MS,
    };
    return parsed.data.access_token;
  }
}
