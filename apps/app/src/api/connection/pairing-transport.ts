import { randomUUID } from 'expo-crypto';
import type { z } from 'zod';
import {
  HUB_IDENTITY_PATH,
  API_ENDPOINTS,
  CLIENT_TOKEN,
  HUB_PUBLIC_IDENTITY,
  HUB_PAIRING_SCOPE_PREFIX,
  NATIVE_HUB_RESPONSE,
  type HubEndpoint,
  type HubIdentity,
} from '@smarteverything/domain';
import { hubNetwork, pinnedFetch } from './route-platform';
import { REQUEST_TIMEOUT_MS, trustOf } from './route-policy';
import { jsonText } from '../../format/json-text';
import { readLeniently } from './readable';

const MAX_PAIRING_RESPONSE = 16 * 1024;
export class PairingIdentityError extends Error {
  override readonly name = 'PairingIdentityError';
  constructor() {
    super(
      'The identities do not match. Scan the code shown on your desktop, or choose another home.',
    );
  }
}
export class PairingResponseError extends Error {
  override readonly name = 'PairingResponseError';
  constructor(readonly status: number) {
    super(
      status === 400 || status === 404 || status === 409 || status === 410
        ? 'Ask the owner to show a new code.'
        : 'Your home could not finish pairing. Try again.',
    );
  }
}
export function requirePairingIdentity(expected: HubIdentity, actual: HubIdentity): void {
  if (
    expected.id !== actual.id ||
    expected.tls.serverName !== actual.tls.serverName ||
    expected.tls.publicKeySha256 !== actual.tls.publicKeySha256 ||
    expected.tls.certificateSha256 !== actual.tls.certificateSha256
  )
    throw new PairingIdentityError();
}
export interface PairingCleanupStep {
  readonly operation: string;
  readonly release: () => void | Promise<void>;
}
export class PairingCleanupError extends AggregateError {
  override readonly name = 'PairingCleanupError';
  constructor(
    readonly failures: readonly { readonly operation: string; readonly cause: unknown }[],
  ) {
    super(
      failures.map((failure) => failure.cause),
      'The pairing cleanup did not finish. Try again.',
    );
  }
}
export async function releasePairingResources(steps: readonly PairingCleanupStep[]): Promise<void> {
  const results = await Promise.all(
    steps.map(async (step) => {
      try {
        await step.release();
        return [];
      } catch (error) {
        return [{ operation: step.operation, cause: error }];
      }
    }),
  );
  const failures = results.flat();
  if (failures.length > 0) throw new PairingCleanupError(failures);
}
const retiredTransports = new Set<PairingTransport>();
export class PairingTransport {
  readonly scopeId = `${HUB_PAIRING_SCOPE_PREFIX}${randomUUID()}`;
  private configured = false;
  private cleanup: Promise<void> = Promise.resolve();
  private verified = false;
  private claimed = false;
  private issuedToken: string | null = null;
  private stopped = false;
  private readonly controller = new AbortController();
  constructor(
    readonly endpoint: HubEndpoint,
    readonly identity: HubIdentity | null,
  ) {}
  async open(): Promise<void> {
    await releasePairingResources(
      [...retiredTransports].map((transport) => ({
        operation: 'native-trust',
        release: (): Promise<void> => transport.close(),
      })),
    );
    this.check();
    if (this.identity === null || !hubNetwork().capabilities.http) {
      if (this.endpoint.kind === 'lan') throw new PairingIdentityError();
      return;
    }
    await hubNetwork().configureTrust(
      trustOf(this.scopeId, {
        identity: this.identity,
        endpoints: [this.endpoint],
        remoteAvailable: this.endpoint.kind === 'remote',
        discovery: { state: 'disabled', detail: '' },
      }),
    );
    this.configured = true;
    if (this.stopped) await this.close();
    this.check();
  }
  async verify(): Promise<HubIdentity> {
    const publicIdentity = await this.read(HUB_IDENTITY_PATH, HUB_PUBLIC_IDENTITY);
    if (this.identity !== null) requirePairingIdentity(this.identity, publicIdentity.identity);
    this.verified = true;
    return publicIdentity.identity;
  }
  private check(): void {
    if (this.stopped) throw new PairingIdentityError();
  }
  async read<S extends z.ZodType>(path: string, schema: S, token?: string): Promise<z.output<S>> {
    if (path === '/api/connection') {
      if (token === undefined || token !== this.issuedToken) throw new PairingIdentityError();
    } else if (path !== HUB_IDENTITY_PATH || token !== undefined) throw new PairingIdentityError();
    const response = await this.send(path, {
      method: 'GET',
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    });
    return this.answer(response, schema);
  }
  private answer<S extends z.ZodType>(response: Response, schema: S): Promise<z.output<S>> {
    return response.text().then((text) => {
      this.check();
      if (!response.ok) throw new PairingResponseError(response.status);
      if (text.length > MAX_PAIRING_RESPONSE) throw new PairingIdentityError();
      const read = jsonText(text);
      const result = readLeniently(schema, read.ok ? read.value : null);
      if (!result.ok) throw new PairingIdentityError();
      return result.data;
    });
  }
  async claim(body: string): Promise<z.output<typeof API_ENDPOINTS.claimPairing.response>> {
    if (!this.verified || this.claimed || body.length > 4096) throw new PairingIdentityError();
    const input = jsonText(body);
    API_ENDPOINTS.claimPairing.body.parse(input.ok ? input.value : null);
    this.claimed = true;
    const response = await this.send(API_ENDPOINTS.claimPairing.path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const issued = await this.answer(response, API_ENDPOINTS.claimPairing.response);
    this.issuedToken = CLIENT_TOKEN.parse(issued.token);
    return issued;
  }
  private async send(path: string, init: RequestInit): Promise<Response> {
    this.check();
    if (this.configured) {
      const response = await pinnedFetch(this.scopeId, `${this.endpoint.url}${path}`, init);
      this.check();
      return response;
    }
    const request = new AbortController();
    const cancel = (): void => {
      request.abort();
    };
    this.controller.signal.addEventListener('abort', cancel);
    const timeout = setTimeout(cancel, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.endpoint.url}${path}`, {
        ...init,
        redirect: 'error',
        signal: request.signal,
      });
      const body = await response.text();
      this.check();
      NATIVE_HUB_RESPONSE.shape.body.max(MAX_PAIRING_RESPONSE).parse(body);
      return new Response(body === '' ? null : body, {
        status: response.status,
        headers: response.headers,
      });
    } finally {
      clearTimeout(timeout);
      this.controller.signal.removeEventListener('abort', cancel);
    }
  }
  close(): Promise<void> {
    this.stopped = true;
    this.issuedToken = null;
    this.controller.abort();
    retiredTransports.add(this);
    const release = (): Promise<void> => this.clearPendingTrust();
    this.cleanup = this.cleanup.then(release, release);
    return this.cleanup;
  }
  private async clearPendingTrust(): Promise<void> {
    if (this.configured) await hubNetwork().clearTrust(this.scopeId);
    this.configured = false;
    retiredTransports.delete(this);
  }
}
