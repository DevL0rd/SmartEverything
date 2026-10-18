import type { KeyObject } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  isSmartThingsUrl,
  keyUrl,
  parseSignatureHeader,
  pingAnswer,
  publicKeyOf,
  readWebhookMessage,
  verifySignedRequest,
  WEBHOOK_EVENT_ANSWER,
  WebhookSignatureError,
  type WebhookMessage,
} from '@smarteverything/smartthings';
import type { SmartThingsWebhooks } from '../../adapters/smartthings/webhooks';
import { readBody, sendJson } from '../../server/http';
import type { Store } from '../../store/store';
import type { TargetConfirmations } from './confirmations';
import { savedPaths } from './paths';
import type { WebhookState } from './webhook-state';
import { messageOf } from '@smarteverything/logging';

const WEBHOOK_BODY_LIMIT = 1024 * 1024;

const KEY_LIFETIME_MS = 24 * 60 * 60 * 1000;

export interface WebhookOptions {
  readonly store: Store;
  readonly webhooks: SmartThingsWebhooks;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly log: Logger;
  readonly state: WebhookState;
  readonly confirmations: TargetConfirmations;
}

export class KeyCache {
  private readonly keys = new Map<string, { key: KeyObject; fetchedAt: number }>();

  constructor(
    private readonly fetch: typeof globalThis.fetch,
    private readonly now: () => Date,
    private readonly log?: Logger,
  ) {}

  async keyFor(keyId: string): Promise<KeyObject> {
    const url = keyUrl(keyId);
    const cached = this.keys.get(keyId);
    const nowMs = this.now().getTime();
    if (cached !== undefined && nowMs - cached.fetchedAt < KEY_LIFETIME_MS) {
      return cached.key;
    }
    const startedAt = performance.now();
    const response = await this.fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new ApiError(
        'upstream_failed',
        `The SmartThings key server answered HTTP ${String(response.status)} for ${keyId}.`,
      );
    }
    const key = publicKeyOf(text);
    this.keys.set(keyId, { key, fetchedAt: nowMs });
    this.log?.debug('webhook.key_fetched', () => ({
      keyId,
      refreshed: cached !== undefined,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    return key;
  }
}

function headersOf(request: IncomingMessage): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(request.headers).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.join(', ') : value,
    ]),
  );
}

function parseJson(raw: Buffer): unknown {
  try {
    const parsed: unknown = JSON.parse(raw.toString('utf8'));
    return parsed;
  } catch (cause) {
    throw new ApiError('invalid_request', `The webhook body is not JSON: ${messageOf(cause)}.`);
  }
}

export class WebhookHandler {
  private readonly keys: KeyCache;

  constructor(private readonly options: WebhookOptions) {
    this.keys = new KeyCache(options.fetch, options.now, options.log);
  }

  readonly handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const startedAt = performance.now();
    const raw = await readBody(request, WEBHOOK_BODY_LIMIT);
    const message = this.messageOf(raw);
    this.options.log.debug('webhook.received', {
      kind: message.kind,
      bytes: raw.length,
      events: message.kind === 'event' ? message.events.length : undefined,
    });
    if (message.kind === 'ping') {
      sendJson(response, 200, pingAnswer(message.challenge));
      this.options.log.debug('webhook.pinged', () => ({
        durationMs: Math.round(performance.now() - startedAt),
      }));
      return;
    }
    await this.verify(request, raw);
    sendJson(response, 200, await this.answer(message));
    this.options.log.debug('webhook.answered', () => ({
      kind: message.kind,
      durationMs: Math.round(performance.now() - startedAt),
    }));
  };

  private messageOf(raw: Buffer): WebhookMessage {
    try {
      return readWebhookMessage(parseJson(raw));
    } catch (cause) {
      this.refused(messageOf(cause));
      throw cause instanceof ApiError ? cause : new ApiError('invalid_request', messageOf(cause));
    }
  }

  private async verify(request: IncomingMessage, body: Buffer): Promise<void> {
    const paths = savedPaths(this.options.store);
    try {
      if (paths === null) {
        throw new WebhookSignatureError('no public URL is saved, so no webhook path is expected');
      }
      const signature = parseSignatureHeader(request.headers.authorization);
      const key = await this.keys.keyFor(signature.keyId);
      verifySignedRequest(
        {
          method: request.method ?? 'POST',
          path: paths.webhookPath,
          headers: headersOf(request),
          body,
        },
        signature,
        key,
        this.options.now(),
      );
    } catch (cause) {
      this.refused(messageOf(cause));
      if (cause instanceof WebhookSignatureError) {
        throw new ApiError('unauthorized', cause.message);
      }
      throw cause instanceof ApiError
        ? cause
        : new ApiError(
            'upstream_failed',
            `The SmartThings key could not be fetched: ${messageOf(cause)}.`,
          );
    }
    this.options.state.accepted();
  }

  private refused(reason: string): void {
    this.options.state.failed(reason);
    this.options.log.warn('webhook.refused', { reason });
  }

  private async answer(message: Exclude<WebhookMessage, { kind: 'ping' }>): Promise<unknown> {
    switch (message.kind) {
      case 'confirmation':
        await this.confirm(message.appId, message.confirmationUrl);
        return {};
      case 'event':
        this.deliver(message.installedAppId, message.events);
        return WEBHOOK_EVENT_ANSWER;
      case 'ignored':
        this.options.log.info('webhook.ignored', { lifecycle: message.lifecycle });
        return {};
    }
  }

  private deliver(
    installedAppId: string,
    events: Extract<WebhookMessage, { kind: 'event' }>['events'],
  ): void {
    this.options.state.eventArrived(this.options.now().toISOString());
    if (!this.options.webhooks.deliver(installedAppId, events)) {
      this.options.log.warn('webhook.unrouted', { installedAppId, events: events.length });
    }
  }

  private async confirm(appId: string, confirmationUrl: string): Promise<void> {
    const { state, log, confirmations } = this.options;
    if (!confirmations.accepts(appId)) {
      this.refused(`a confirmation arrived for app ${appId}, which is not this server's app`);
      throw new ApiError('forbidden', 'This server does not expect a confirmation for that app.');
    }
    if (!isSmartThingsUrl(confirmationUrl)) {
      this.refused(`the confirmation URL ${confirmationUrl} is not on smartthings.com`);
      throw new ApiError('invalid_request', 'The confirmation URL is not a SmartThings URL.');
    }
    const response = await this.options.fetch(confirmationUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    if (!response.ok) {
      const reason = `SmartThings answered the confirmation with HTTP ${String(response.status)}: ${text}`;
      state.failed(reason);
      log.error('webhook.confirmation_failed', new Error(reason), { appId });
      throw new ApiError('upstream_failed', reason);
    }
    state.confirmed(this.options.now().toISOString());
    log.info('webhook.confirmed', { appId });
    confirmations.record(appId);
  }
}
