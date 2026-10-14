import { createHash } from 'node:crypto';
import {
  HUB_CONNECTION_METADATA,
  HUB_IDENTITY_PATH,
  HUB_PUBLIC_IDENTITY,
  type HubIdentity,
} from '../../../../packages/domain/src/hub-connections';
import { HUB_PAIRING_SCOPE_PREFIX } from '../../../../packages/domain/src/hub-pairing';
import { CLIENT_TOKEN } from '../../../../packages/domain/src/api/access';
import { ACCESS_ENDPOINTS } from '../../../../packages/domain/src/api/endpoints-access';
import {
  NATIVE_HUB_TRUST,
  type NativeHubRequest,
  type NativeHubResponse,
} from '../../../../packages/domain/src/hub-native';
import { HubPolicies, HubTransportError } from './policy.js';
import { requestHub } from './request.js';

class Enrollment<Owner> {
  readonly controller = new AbortController();
  private claimed = false;
  private verified = false;
  principal: string | undefined;
  tokenHash: string | undefined;
  constructor(
    readonly owner: Owner,
    readonly origin: string,
    readonly identity: HubIdentity,
  ) {}
  check(): void {
    if (this.controller.signal.aborted)
      throw new HubTransportError('Pairing enrollment was withdrawn');
  }
  verify(identity: HubIdentity): void {
    requireIdentity(this.identity, identity);
    this.verified = true;
  }
  beginClaim(): void {
    if (!this.verified || this.claimed)
      throw new HubTransportError('Verify pairing identity before its single claim');
    this.claimed = true;
  }
  issued(token: string, principal: string): void {
    this.tokenHash = tokenHash(CLIENT_TOKEN.parse(token));
    this.principal = principal;
  }
}
function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function json(body: string): unknown {
  if (Buffer.byteLength(body) > 16 * 1024)
    throw new HubTransportError('Pairing response exceeds the enrollment bound');
  const value: unknown = JSON.parse(body);
  return value;
}
function requireIdentity(expected: HubIdentity, actual: HubIdentity): void {
  if (JSON.stringify(expected.tls) !== JSON.stringify(actual.tls) || expected.id !== actual.id)
    throw new HubTransportError('Pairing identity changed during enrollment');
}
function requireNoCredentials(input: NativeHubRequest): void {
  if (Object.keys(input.headers).some((name) => name.toLowerCase() !== 'content-type'))
    throw new HubTransportError('Pairing enrollment accepts no supplied credentials');
}

export class DesktopPairingEnrollments<Owner> {
  readonly #policies = new HubPolicies();
  readonly #scopes = new Map<string, Enrollment<Owner>>();
  configure(owner: Owner, value: unknown): void {
    const trust = NATIVE_HUB_TRUST.parse(value);
    if (!trust.scopeId.startsWith(HUB_PAIRING_SCOPE_PREFIX) || trust.endpoints.length !== 1)
      throw new HubTransportError('Pairing enrollment requires one private endpoint');
    const endpoint = trust.endpoints[0];
    if (endpoint === undefined || endpoint.kind === 'loopback')
      throw new HubTransportError('Pairing enrollment requires an encrypted endpoint');
    if ([...this.#scopes.values()].some((scope) => scope.owner === owner))
      throw new HubTransportError('Withdraw the previous pairing enrollment first');
    if (this.#scopes.size >= 4 || this.#scopes.has(trust.scopeId))
      throw new HubTransportError('Pairing enrollment namespace is occupied');
    this.#policies.configure(trust);
    this.#scopes.set(
      trust.scopeId,
      new Enrollment(owner, new URL(endpoint.url).origin, trust.identity),
    );
  }
  async request(owner: Owner, input: NativeHubRequest): Promise<NativeHubResponse> {
    const scope = this.#scopes.get(input.scopeId);
    if (scope?.owner !== owner)
      throw new HubTransportError('Pairing scope belongs to another owner or was withdrawn');
    scope.check();
    const url = new URL(input.url);
    if (
      url.origin !== scope.origin ||
      url.search !== '' ||
      url.hash !== '' ||
      input.binding !== undefined ||
      input.routeGeneration !== undefined
    )
      throw new HubTransportError('Pairing requests require their immutable selected endpoint');
    this.#validateRequest(scope, input, url.pathname);
    const response = await requestHub(
      {
        lease: (id, target) => ({
          ...this.#policies.lease(id, target),
          signal: scope.controller.signal,
        }),
      },
      input,
    );
    scope.check();
    if (this.#scopes.get(input.scopeId) !== scope)
      throw new HubTransportError('Pairing enrollment was withdrawn before its response');
    this.#accept(scope, url.pathname, response);
    return response;
  }
  #validateRequest(scope: Enrollment<Owner>, input: NativeHubRequest, path: string): void {
    if (path === '/api/connection') {
      this.#metadataRequest(scope, input);
      return;
    }
    requireNoCredentials(input);
    if (path === HUB_IDENTITY_PATH && input.method === 'GET' && input.body === null) return;
    if (path !== ACCESS_ENDPOINTS.claimPairing.path)
      throw new HubTransportError('Pairing request path is forbidden');
    this.#claimRequest(scope, input);
  }
  #claimRequest(scope: Enrollment<Owner>, input: NativeHubRequest): void {
    if (input.method !== 'POST' || input.body === null || Buffer.byteLength(input.body) > 4096)
      throw new HubTransportError('Pairing enrollment requires one bounded claim');
    ACCESS_ENDPOINTS.claimPairing.body.parse(json(input.body));
    scope.beginClaim();
  }
  #metadataRequest(scope: Enrollment<Owner>, input: NativeHubRequest): void {
    const headers = Object.entries(input.headers);
    const header = headers[0];
    if (
      input.method !== 'GET' ||
      input.body !== null ||
      headers.length !== 1 ||
      header === undefined
    )
      throw new HubTransportError('Pairing metadata requires one new-client authorization header');
    const [name, bearer] = header;
    if (
      name.toLowerCase() !== 'authorization' ||
      !bearer.startsWith('Bearer ') ||
      scope.tokenHash === undefined ||
      tokenHash(bearer.slice(7)) !== scope.tokenHash
    )
      throw new HubTransportError('Pairing metadata credential differs from its issued client');
  }
  #accept(scope: Enrollment<Owner>, path: string, response: NativeHubResponse): void {
    if (response.status < 200 || response.status >= 300) return;
    if (path === HUB_IDENTITY_PATH) {
      scope.verify(HUB_PUBLIC_IDENTITY.parse(json(response.body)).identity);
    } else if (path === ACCESS_ENDPOINTS.claimPairing.path) {
      const issued = ACCESS_ENDPOINTS.claimPairing.response.parse(json(response.body));
      scope.issued(issued.token, issued.client.id);
    } else {
      requireIdentity(scope.identity, HUB_CONNECTION_METADATA.parse(json(response.body)).identity);
    }
  }
  clear(scopeId: string): void {
    this.#scopes
      .get(scopeId)
      ?.controller.abort(new HubTransportError('Pairing enrollment withdrawn'));
    this.#scopes.delete(scopeId);
    this.#policies.clear(scopeId);
  }
  close(): void {
    for (const scope of this.#scopes.keys()) this.clear(scope);
  }
}
