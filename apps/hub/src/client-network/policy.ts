import { createHash, X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';
import { Agent } from 'node:https';
import { z } from 'zod';
import { connect, checkServerIdentity, type TLSSocket } from 'node:tls';
import {
  NATIVE_HUB_TRUST,
  type NativeHubCredentialBinding,
  type NativeHubTrust,
} from '@smarteverything/domain';

export class HubTransportError extends Error {
  override readonly name = 'HubTransportError';
  constructor(readonly detail: string) {
    super(detail);
  }
}
function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
function verify(socket: TLSSocket, trust: NativeHubTrust): void {
  const certificate = socket.getPeerCertificate(true);
  const hostnameError = checkServerIdentity(trust.identity.tls.serverName, certificate);
  if (hostnameError !== undefined) throw hostnameError;
  const x509 = new X509Certificate(certificate.raw);
  if (
    x509.checkHost(trust.identity.tls.serverName, { subject: 'never', wildcards: false }) !==
    trust.identity.tls.serverName
  )
    throw new HubTransportError('Hub certificate requires the enrolled DNS SAN');
  const now = Date.now();
  if (now < Date.parse(x509.validFrom) || now > Date.parse(x509.validTo))
    throw new HubTransportError('Hub certificate has expired or is not yet valid');
  const key = x509.publicKey.export({ type: 'spki', format: 'der' });
  if (
    digest(certificate.raw) !== trust.identity.tls.certificateSha256 ||
    digest(key) !== trust.identity.tls.publicKeySha256
  )
    throw new HubTransportError('Hub certificate does not match paired identity');
}
class PinnedHubAgent extends Agent {
  readonly #pending = new Set<TLSSocket>();
  #closed = false;
  constructor(
    readonly trust: NativeHubTrust,
    readonly address: string,
  ) {
    super({ keepAlive: false, maxSockets: 8 });
  }
  override createConnection(
    options: Parameters<Agent['createConnection']>[0],
    callback: Parameters<Agent['createConnection']>[1],
  ): undefined {
    const address = this.address;
    if (isIP(address) === 0) throw new HubTransportError('No supported LAN address');
    const signal = z
      .object({ hubAbortSignal: z.instanceof(AbortSignal).optional() })
      .parse(options).hubAbortSignal;
    const socket = connect({
      port: z.coerce.number().int().min(1).max(65535).parse(options.port),
      host: address,
      servername: this.trust.identity.tls.serverName,
      rejectUnauthorized: false,
      ...(signal === undefined ? {} : { signal }),
    });
    this.#pending.add(socket);
    const failed = (error: Error): void => {
      callback?.(error, socket);
    };
    socket.once('error', failed);
    socket.setTimeout(15_000, () => {
      socket.destroy(new HubTransportError('Hub TLS handshake timed out'));
    });
    socket.once('close', () => {
      this.#pending.delete(socket);
    });
    socket.once('secureConnect', () => {
      try {
        if (this.#closed) throw new HubTransportError('Hub trust was withdrawn during handshake');
        verify(socket, this.trust);
        socket.setTimeout(0);
        socket.removeListener('error', failed);
        callback?.(null, socket);
      } catch (cause) {
        socket.destroy(
          cause instanceof Error ? cause : new HubTransportError('Certificate verification failed'),
        );
      }
    });
    return undefined;
  }
  override destroy(): void {
    this.#closed = true;
    for (const socket of this.#pending)
      socket.destroy(new HubTransportError('Hub trust withdrawn'));
    this.#pending.clear();
    super.destroy();
  }
}
interface Policy {
  readonly trust: NativeHubTrust;
  readonly agents: Map<string, PinnedHubAgent>;
}
function extendsInventory(previous: NativeHubTrust, next: NativeHubTrust): boolean {
  return (
    JSON.stringify(previous.identity) === JSON.stringify(next.identity) &&
    previous.endpoints.every((endpoint) =>
      next.endpoints.some((candidate) => JSON.stringify(candidate) === JSON.stringify(endpoint)),
    ) &&
    previous.lanAddresses.every((address) => next.lanAddresses.includes(address))
  );
}
function conflictingIdentity(previous: NativeHubTrust, next: NativeHubTrust): boolean {
  return (
    previous.scopeId !== next.scopeId &&
    previous.identity.tls.serverName === next.identity.tls.serverName &&
    (previous.identity.id !== next.identity.id ||
      previous.identity.tls.certificateSha256 !== next.identity.tls.certificateSha256)
  );
}
export class HubPolicies {
  readonly #policies = new Map<string, Policy>();
  configure(value: unknown): boolean {
    const trust = NATIVE_HUB_TRUST.parse(value);
    if (trust.identity.id !== trust.identity.tls.publicKeySha256)
      throw new HubTransportError('Identity and SPKI disagree');
    for (const policy of this.#policies.values()) {
      if (conflictingIdentity(policy.trust, trust))
        throw new HubTransportError('Conflicting same-host scoped trust');
    }
    const previous = this.#policies.get(trust.scopeId);
    if (JSON.stringify(previous?.trust) === JSON.stringify(trust)) return false;
    if (previous !== undefined && extendsInventory(previous.trust, trust)) {
      this.#policies.set(trust.scopeId, { trust, agents: previous.agents });
      return false;
    }
    this.clear(trust.scopeId);
    this.#policies.set(trust.scopeId, { trust, agents: new Map() });
    return true;
  }
  clear(scopeId: string): void {
    const policy = this.#policies.get(scopeId);
    if (policy !== undefined) for (const agent of policy.agents.values()) agent.destroy();
    this.#policies.delete(scopeId);
  }
  close(): void {
    for (const scope of this.#policies.keys()) this.clear(scope);
  }
  lease(
    scopeId: string,
    input: string,
    binding?: NativeHubCredentialBinding,
    routeGeneration?: number,
  ): { readonly url: URL; readonly agent: Agent | undefined } {
    if (binding !== undefined || routeGeneration !== undefined)
      throw new HubTransportError('This transport has no native route authority');
    const policy = this.#policies.get(scopeId);
    if (policy === undefined) throw new HubTransportError('Hub scope has no enrolled trust');
    const url = new URL(input);
    if (url.username !== '' || url.password !== '' || url.hash !== '')
      throw new HubTransportError('Invalid hub request URL');
    const endpoint = policy.trust.endpoints.find(
      (entry) => new URL(entry.url).origin === url.origin,
    );
    if (endpoint === undefined) throw new HubTransportError('Hub endpoint has no enrolled trust');
    if (endpoint.kind !== 'lan') return { url, agent: undefined };
    return this.#lanLease(policy, url);
  }
  #lanLease(policy: Policy, original: URL): { readonly url: URL; readonly agent: Agent } {
    const url = new URL(original);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const address = isIP(hostname) > 0 ? hostname : policy.trust.lanAddresses[0];
    if (address === undefined || !policy.trust.lanAddresses.includes(address))
      throw new HubTransportError('LAN endpoint has no scoped address');
    let agent = policy.agents.get(address);
    if (agent === undefined) {
      agent = new PinnedHubAgent(policy.trust, address);
      policy.agents.set(address, agent);
    }
    url.hostname = policy.trust.identity.tls.serverName;
    return { url, agent };
  }
}
