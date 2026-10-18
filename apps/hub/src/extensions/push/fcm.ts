import type { PushServiceAccount } from '@smarteverything/domain';
import { failureLine, Logger, messageOf } from '@smarteverything/logging';
import { JWT } from 'google-auth-library';
import { z } from 'zod';
import type { PushDelivery } from './commands';

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

const REQUEST_TIMEOUT_MS = 15_000;

const log = new Logger('hub.push-fcm');

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

function fcmMessageOf(token: string, notification: PushNotification): FcmMessage {
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

async function textOf(response: Response): Promise<string> {
  return (await response.text()).slice(0, 2000);
}

function jsonOf(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (cause) {
    return { notJson: text, cause: failureLine(cause) };
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

interface CachedClient {
  readonly identity: string;
  readonly jwt: JWT;
}

export class FcmClient {
  private cached: CachedClient | null = null;

  constructor(private readonly fetch: typeof globalThis.fetch) {}

  send(
    account: PushServiceAccount,
    token: string,
    notification: PushNotification,
  ): Promise<Delivery> {
    return this.deliver(account, fcmMessageOf(token, notification));
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
    const startedAt = performance.now();
    const first = await this.attempt(account, message);
    if (first.status !== 401) {
      const delivery =
        first.status < 300 ? { outcome: 'sent' as const } : deliveryOf(first.status, first.text);
      this.logDelivery(account, delivery, { status: first.status, startedAt, retried: false });
      return delivery;
    }
    log.info('fcm.token_refused_retrying', { project: account.project_id });
    this.cached = null;
    const second = await this.attempt(account, message);
    const delivery =
      second.status < 300 ? { outcome: 'sent' as const } : deliveryOf(second.status, second.text);
    this.logDelivery(account, delivery, { status: second.status, startedAt, retried: true });
    return delivery;
  }

  private logDelivery(
    account: PushServiceAccount,
    delivery: Delivery,
    attempt: { readonly status: number; readonly startedAt: number; readonly retried: boolean },
  ): void {
    const fields = {
      project: account.project_id,
      status: attempt.status,
      outcome: delivery.outcome,
      reason: delivery.outcome === 'sent' ? undefined : delivery.reason.slice(0, 300),
      retried: attempt.retried,
      durationMs: Math.round(performance.now() - attempt.startedAt),
    };
    if (delivery.outcome === 'failed') log.warn('fcm.send_failed', fields);
    else log.debug('fcm.send_settled', fields);
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

  private async accessToken(account: PushServiceAccount): Promise<string> {
    const startedAt = performance.now();
    const { token } = await this.clientFor(account)
      .getAccessToken()
      .catch((cause: unknown) => {
        this.cached = null;
        log.error('fcm.access_token_failed', cause, {
          project: account.project_id,
          durationMs: Math.round(performance.now() - startedAt),
        });
        throw new PushAuthorizationError(messageOf(cause));
      });
    if (typeof token !== 'string') {
      log.error('fcm.access_token_missing', undefined, { project: account.project_id });
      throw new PushAuthorizationError('Google sent no access token');
    }
    const elapsed = Math.round(performance.now() - startedAt);
    if (elapsed > 50)
      log.debug('fcm.access_token_fetched', { project: account.project_id, durationMs: elapsed });
    return token;
  }

  private clientFor(account: PushServiceAccount): JWT {
    const identity = JSON.stringify([account.client_email, account.private_key]);
    if (this.cached?.identity !== identity) {
      log.debug('fcm.client_created', {
        project: account.project_id,
        replaced: this.cached !== null,
      });
      this.cached = {
        identity,
        jwt: new JWT({
          email: account.client_email,
          key: account.private_key,
          scopes: FCM_SCOPE,
          transporterOptions: {
            fetchImplementation: this.fetch,
            timeout: REQUEST_TIMEOUT_MS,
          },
        }),
      };
    }
    return this.cached.jwt;
  }
}
