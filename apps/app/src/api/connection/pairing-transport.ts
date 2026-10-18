import { randomUUID } from 'expo-crypto';
import type { z } from 'zod';
import {
  HUB_IDENTITY_PATH,
  HUB_PAIRING_SCOPE_PREFIX,
  HUB_REQUEST_TIMEOUT_MS,
  HUB_PUBLIC_IDENTITY,
  type HubEndpoint,
  type HubIdentity,
} from '@smarteverything/domain';
import { jsonText } from '../../format/json-text';
import {
  PairingCancelledError,
  PairingResponseError,
  PairingUnreadableError,
} from './pairing-errors';
import { readLeniently } from './readable';
import { hubNetwork, pinnedFetch } from './route-platform';
import { trustOf } from './route-policy';
import { Logger } from '@smarteverything/logging';
import { failureFacts, nowMs } from './request-log';

const log = new Logger('app.pairing');

export class PairingTransport {
  readonly scopeId = `${HUB_PAIRING_SCOPE_PREFIX}${randomUUID()}`;
  private configured = false;
  private stopped = false;
  private cleanup: Promise<void> = Promise.resolve();
  private readonly controller = new AbortController();
  constructor(
    readonly endpoint: HubEndpoint,
    private readonly identity: HubIdentity | null,
  ) {}
  async open(): Promise<void> {
    this.check();
    if (this.identity === null || !hubNetwork().capabilities.http) {
      log.debug('pairing.transport_opened', () => ({
        scopeId: this.scopeId.slice(-8),
        pinned: false,
        kind: this.endpoint.kind,
      }));
      return;
    }
    const startedAt = nowMs();
    await hubNetwork().configureTrust(
      trustOf(this.scopeId, {
        identity: this.identity,
        endpoints: [this.endpoint],
        remoteAvailable: this.endpoint.kind === 'remote',
        discovery: { state: 'disabled', detail: '' },
      }),
    );
    this.configured = true;
    log.debug('pairing.transport_opened', () => ({
      scopeId: this.scopeId.slice(-8),
      pinned: true,
      kind: this.endpoint.kind,
      elapsedMs: nowMs() - startedAt,
    }));
    if (this.stopped) await this.close();
    this.check();
  }
  async identityOf(): Promise<HubIdentity> {
    const answer = await this.get(HUB_IDENTITY_PATH, HUB_PUBLIC_IDENTITY);
    return answer.identity;
  }
  get<S extends z.ZodType>(path: string, schema: S, token?: string): Promise<z.output<S>> {
    return this.send(
      path,
      { method: 'GET', headers: token === undefined ? {} : { authorization: `Bearer ${token}` } },
      schema,
    );
  }
  post<S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.output<S>> {
    return this.send(
      path,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      schema,
    );
  }
  private check(): void {
    if (this.stopped) throw new PairingCancelledError();
  }
  private async send<S extends z.ZodType>(
    path: string,
    init: RequestInit,
    schema: S,
  ): Promise<z.output<S>> {
    this.check();
    const startedAt = nowMs();
    const facts = {
      method: init.method ?? 'GET',
      path,
      kind: this.endpoint.kind,
      pinned: this.configured,
    };
    let response: { readonly status: number; readonly body: string };
    try {
      response = await this.fetchText(`${this.endpoint.url}${path}`, init);
    } catch (error) {
      log.warn('pairing.request_failed', {
        ...facts,
        elapsedMs: nowMs() - startedAt,
        stopped: this.stopped,
        ...failureFacts(error),
      });
      throw error;
    }
    this.check();
    const elapsedMs = nowMs() - startedAt;
    if (response.status < 200 || response.status >= 300) {
      log.warn('pairing.request_refused', { ...facts, status: response.status, elapsedMs });
      throw new PairingResponseError(response.status);
    }
    const read = jsonText(response.body);
    const result = readLeniently(schema, read.ok ? read.value : null);
    if (!result.ok) {
      log.warn('pairing.answer_unreadable', {
        ...facts,
        status: response.status,
        elapsedMs,
        bodyLength: response.body.length,
      });
      throw new PairingUnreadableError();
    }
    log.debug('pairing.request_done', () => ({ ...facts, status: response.status, elapsedMs }));
    return result.data;
  }
  private async fetchText(
    url: string,
    init: RequestInit,
  ): Promise<{ readonly status: number; readonly body: string }> {
    if (this.configured) {
      const response = await pinnedFetch(this.scopeId, url, init);
      return { status: response.status, body: await response.text() };
    }
    const request = new AbortController();
    const cancel = (): void => {
      request.abort();
    };
    this.controller.signal.addEventListener('abort', cancel);
    const timeout = setTimeout(cancel, HUB_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, redirect: 'error', signal: request.signal });
      return { status: response.status, body: await response.text() };
    } finally {
      clearTimeout(timeout);
      this.controller.signal.removeEventListener('abort', cancel);
    }
  }
  close(): Promise<void> {
    log.debug('pairing.transport_closing', () => ({
      scopeId: this.scopeId.slice(-8),
      configured: this.configured,
      alreadyStopped: this.stopped,
    }));
    this.stopped = true;
    this.controller.abort();
    const release = (): Promise<void> => this.clearTrust();
    this.cleanup = this.cleanup.then(release, release);
    return this.cleanup;
  }
  private async clearTrust(): Promise<void> {
    if (!this.configured) return;
    this.configured = false;
    await hubNetwork().clearTrust(this.scopeId);
  }
}
