import type { z } from 'zod';
import {
  API_ENDPOINTS,
  HUB_CONNECTION_METADATA,
  HUB_ENDPOINT,
  HUB_IDENTITY,
  type ClientRow,
  type HubConnectionMetadata,
  type HubEndpoint,
  type HubIdentity,
} from '@smarteverything/domain';
import { appPlatform } from '../../design/platform';
import { ValueStore } from '../../design/external-store';
import {
  PairingTransport,
  PairingIdentityError,
  PairingResponseError,
  requirePairingIdentity,
} from './pairing-transport';
import type { ServerConnection, StoredKind } from './storage';

type Claim = z.infer<typeof API_ENDPOINTS.claimPairing.response>;
export type EnrollmentDestination =
  | { readonly kind: 'https'; readonly endpoint: HubEndpoint }
  | { readonly kind: 'pinned'; readonly endpoint: HubEndpoint; readonly identity: HubIdentity };
export type EnrollmentState =
  | { readonly status: 'verifying' }
  | {
      readonly status: 'ready';
      readonly destination: EnrollmentDestination;
      readonly identity: HubIdentity;
    }
  | { readonly status: 'claiming' }
  | { readonly status: 'recoverable'; readonly problem: string }
  | { readonly status: 'unknown'; readonly problem: string }
  | { readonly status: 'complete'; readonly client: ClientRow }
  | { readonly status: 'failed'; readonly problem: string }
  | { readonly status: 'cancelled' };
export interface EnrollmentResult {
  readonly connection: ServerConnection;
  readonly client: ClientRow;
}
export class PairingUnknownOutcomeError extends Error {
  override readonly name = 'PairingUnknownOutcomeError';
  constructor() {
    super(
      'Pairing may have finished. Check Paired devices on your desktop before showing a new code.',
    );
  }
}
export class PairingBusyError extends Error {
  override readonly name = 'PairingBusyError';
  constructor() {
    super('Finish or cancel the current pairing before starting another.');
  }
}
function encryptedOrigin(endpoint: HubEndpoint): HubEndpoint {
  const parsed = HUB_ENDPOINT.parse(endpoint);
  const url = new URL(parsed.url);
  const loopback = parsed.kind === 'loopback' && appPlatform() === 'web';
  if (
    (!loopback && url.protocol !== 'https:') ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new PairingIdentityError();
  return { ...parsed, url: url.origin };
}
function checkedInventory(
  metadata: HubConnectionMetadata,
  endpoint: HubEndpoint,
): HubConnectionMetadata {
  const endpoints = metadata.endpoints
    .filter(
      (entry) =>
        entry.kind !== 'loopback' || (endpoint.kind === 'loopback' && entry.url === endpoint.url),
    )
    .map(encryptedOrigin);
  if (new Set(endpoints.map((entry) => entry.url)).size !== endpoints.length)
    throw new PairingIdentityError();
  const selected = endpoints.find((entry) => entry.url === endpoint.url);
  if (selected?.kind !== endpoint.kind) throw new PairingIdentityError();
  return { ...metadata, endpoints };
}
function immutableIdentity(identity: HubIdentity): HubIdentity {
  const parsed = HUB_IDENTITY.parse(identity);
  return Object.freeze({ ...parsed, tls: Object.freeze(parsed.tls) });
}
function immutableDestination(destination: EnrollmentDestination): EnrollmentDestination {
  const endpoint = Object.freeze(encryptedOrigin(destination.endpoint));
  return destination.kind === 'https'
    ? Object.freeze({ kind: 'https', endpoint })
    : Object.freeze({
        kind: 'pinned',
        endpoint,
        identity: immutableIdentity(destination.identity),
      });
}
export class PairingEnrollment {
  readonly state = new ValueStore<EnrollmentState>({ status: 'verifying' });
  private readonly transport: PairingTransport;
  private identity: HubIdentity | null = null;
  private issued: Claim | null = null;
  private result: EnrollmentResult | null = null;
  private claimStarted = false;
  readonly destination: EnrollmentDestination;
  constructor(
    destination: EnrollmentDestination,
    private readonly isCurrent: () => boolean,
  ) {
    this.destination = immutableDestination(destination);
    this.transport = new PairingTransport(
      this.destination.endpoint,
      this.destination.kind === 'pinned' ? this.destination.identity : null,
    );
  }
  private check(): void {
    if (!this.isCurrent() || this.state.get().status === 'cancelled')
      throw new PairingIdentityError();
  }
  async verify(): Promise<void> {
    try {
      await this.transport.open();
      this.check();
      this.identity = immutableIdentity(await this.transport.verify());
      this.check();
      this.state.set({ status: 'ready', destination: this.destination, identity: this.identity });
    } catch (error) {
      await this.cancel();
      throw error;
    }
  }
  submit(code: string, name: string, kind: StoredKind): Promise<EnrollmentResult> {
    this.check();
    if (this.claimStarted || this.state.get().status !== 'ready') throw new PairingBusyError();
    const body = API_ENDPOINTS.claimPairing.body.parse({
      code,
      name,
      platform: kind === 'phone' ? 'android' : 'web',
    });
    this.claimStarted = true;
    this.state.set({ status: 'claiming' });
    return this.claim(JSON.stringify(body));
  }
  private async claim(body: string): Promise<EnrollmentResult> {
    try {
      this.issued = await this.transport.claim(body);
    } catch (error) {
      if (error instanceof PairingResponseError && error.status < 500) {
        this.state.set({ status: 'failed', problem: error.message });
        await this.transport.close();
        throw error;
      }
      const unknown = new PairingUnknownOutcomeError();
      this.state.set({ status: 'unknown', problem: unknown.message });
      await this.transport.close();
      throw unknown;
    }
    return this.metadata();
  }
  private async metadata(): Promise<EnrollmentResult> {
    try {
      this.check();
      const issued = this.issued;
      const identity = this.identity;
      if (issued === null || identity === null) throw new PairingIdentityError();
      const metadata = await this.transport.read(
        '/api/connection',
        HUB_CONNECTION_METADATA,
        issued.token,
      );
      this.check();
      requirePairingIdentity(identity, metadata.identity);
      const inventory = checkedInventory(metadata, this.transport.endpoint);
      const canonical =
        inventory.endpoints.find((entry) => entry.kind === 'remote') ?? this.transport.endpoint;
      this.result = {
        client: issued.client,
        connection: {
          url: canonical.url,
          canonicalKind: canonical.kind,
          token: issued.token,
          trustedMetadata: inventory,
        },
      };
      return this.result;
    } catch (error) {
      if (!this.isCurrent() || this.state.get().status === 'cancelled') throw error;
      if (error instanceof PairingIdentityError) {
        await this.cancel();
        throw error;
      }
      this.state.set({
        status: 'recoverable',
        problem: 'Pairing finished. Try saving this connection again.',
      });
      throw error;
    }
  }
  recover(): Promise<EnrollmentResult> {
    this.check();
    if (this.state.get().status !== 'recoverable') throw new PairingBusyError();
    this.state.set({ status: 'claiming' });
    return this.result === null ? this.metadata() : Promise.resolve(this.result);
  }
  savingFailed(): void {
    this.state.set({
      status: 'recoverable',
      problem: 'Pairing finished. Try saving this connection again.',
    });
  }
  async complete(): Promise<void> {
    this.check();
    if (this.result === null) throw new PairingIdentityError();
    await this.transport.close();
    this.check();
    this.state.set({ status: 'complete', client: this.result.client });
    this.issued = null;
  }
  async cancel(): Promise<void> {
    this.state.set({ status: 'cancelled' });
    this.issued = null;
    this.result = null;
    await this.transport.close();
  }
}
