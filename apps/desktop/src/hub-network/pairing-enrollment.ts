import {
  HUB_PAIRING_SCOPE_PREFIX,
  NATIVE_HUB_TRUST,
  type NativeHubRequest,
  type NativeHubResponse,
} from '@smarteverything/domain';
import { HubPolicies, HubTransportError } from '@smarteverything/hub/client-network/policy';
import { requestHub } from '@smarteverything/hub/client-network/request';

interface PairingScope<Owner> {
  readonly owner: Owner;
  readonly origin: string;
  readonly controller: AbortController;
}

export class DesktopPairingEnrollments<Owner> {
  readonly #policies = new HubPolicies();
  readonly #scopes = new Map<string, PairingScope<Owner>>();
  configure(owner: Owner, value: unknown): void {
    const trust = NATIVE_HUB_TRUST.parse(value);
    const endpoint = trust.endpoints[0];
    if (
      !trust.scopeId.startsWith(HUB_PAIRING_SCOPE_PREFIX) ||
      trust.endpoints.length !== 1 ||
      endpoint === undefined ||
      endpoint.kind === 'loopback'
    )
      throw new HubTransportError('Pairing requires one encrypted endpoint');
    this.clear(trust.scopeId);
    this.#policies.configure(trust);
    this.#scopes.set(trust.scopeId, {
      owner,
      origin: new URL(endpoint.url).origin,
      controller: new AbortController(),
    });
  }
  async request(owner: Owner, input: NativeHubRequest): Promise<NativeHubResponse> {
    const scope = this.#scopes.get(input.scopeId);
    if (scope?.owner !== owner)
      throw new HubTransportError('Pairing scope belongs to another owner or was withdrawn');
    if (new URL(input.url).origin !== scope.origin)
      throw new HubTransportError(
        'Pairing requests stay on the endpoint the home was inspected at',
      );
    return await requestHub(
      {
        lease: (id, target) => ({
          ...this.#policies.lease(id, target),
          signal: scope.controller.signal,
        }),
      },
      input,
    );
  }
  clear(scopeId: string): void {
    this.#scopes.get(scopeId)?.controller.abort(new HubTransportError('Pairing withdrawn'));
    this.#scopes.delete(scopeId);
    this.#policies.clear(scopeId);
  }
  close(): void {
    for (const scope of this.#scopes.keys()) this.clear(scope);
  }
}
