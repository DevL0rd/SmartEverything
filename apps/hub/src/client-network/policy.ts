import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { Agent as SocketAgent } from 'node:https';
import { connect, type TLSSocket } from 'node:tls';
import { Agent } from 'undici';
import { Logger } from '@smarteverything/logging';
import {
  HUB_REQUEST_TIMEOUT_MS,
  NATIVE_HUB_TRUST,
  type NativeHubTrust,
} from '@smarteverything/domain';
import type { HubLease } from './lease';

const log = new Logger('hub.client-network');

export class HubTransportError extends Error {
  override readonly name = 'HubTransportError';
  constructor(readonly detail: string) {
    super(detail);
  }
}
export class HubRefusalError extends HubTransportError {
  constructor(
    detail: string,
    readonly status: 403 | 409,
  ) {
    super(detail);
  }
}
function pinMismatch(socket: TLSSocket, trust: NativeHubTrust): HubTransportError | null {
  const certificate = socket.getPeerX509Certificate();
  if (certificate === undefined) return new HubTransportError('Hub presented no certificate');
  const key = createHash('sha256')
    .update(certificate.publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex');
  return key === trust.identity.tls.publicKeySha256
    ? null
    : new HubTransportError('Hub certificate key does not match the paired identity');
}
function openPinned(
  trust: NativeHubTrust,
  address: string,
  port: number,
  done: (error: Error | null, socket: TLSSocket) => void,
): void {
  const socket = connect({
    host: address,
    port,
    servername: trust.identity.tls.serverName,
    rejectUnauthorized: false,
  });
  socket.setNoDelay(true);
  let settled = false;
  const settle = (error: Error | null): void => {
    if (settled) return;
    settled = true;
    socket.setTimeout(0);
    done(error, socket);
  };
  socket.setTimeout(HUB_REQUEST_TIMEOUT_MS, () => {
    socket.destroy(new HubTransportError('Hub TLS handshake timed out'));
  });
  socket.once('error', settle);
  socket.once('secureConnect', () => {
    const mismatch = pinMismatch(socket, trust);
    if (mismatch === null) settle(null);
    else socket.destroy(mismatch);
  });
}
class PinnedSocketAgent extends SocketAgent {
  constructor(
    readonly trust: NativeHubTrust,
    readonly address: string,
  ) {
    super({ keepAlive: false });
  }
  override createConnection(
    options: Parameters<SocketAgent['createConnection']>[0],
    callback: Parameters<SocketAgent['createConnection']>[1],
  ): undefined {
    openPinned(this.trust, this.address, Number(options.port ?? 443), (error, socket) => {
      callback?.(error, socket);
    });
    return undefined;
  }
}
function closing(done: Promise<void>): void {
  done.catch((cause: unknown) => {
    log.warn('route.close_failed', { error_name: cause instanceof Error ? cause.name : 'unknown' });
  });
}
interface PinnedRoute {
  readonly dispatcher: Agent;
  readonly agent: SocketAgent;
}
function pinnedRoute(trust: NativeHubTrust, address: string): PinnedRoute {
  return {
    dispatcher: new Agent({
      connect: (options, callback): void => {
        openPinned(trust, address, Number(options.port), (error, socket) => {
          if (error === null) callback(null, socket);
          else callback(error, null);
        });
      },
    }),
    agent: new PinnedSocketAgent(trust, address),
  };
}
interface Policy {
  trust: NativeHubTrust;
  readonly routes: Map<string, PinnedRoute>;
}
export class HubPolicies {
  readonly #policies = new Map<string, Policy>();
  configure(value: unknown): boolean {
    const trust = NATIVE_HUB_TRUST.parse(value);
    const previous = this.#policies.get(trust.scopeId);
    if (
      previous?.trust.identity.id === trust.identity.id &&
      previous.trust.identity.tls.serverName === trust.identity.tls.serverName
    ) {
      previous.trust = trust;
      for (const [address, route] of previous.routes)
        if (!trust.lanAddresses.includes(address)) {
          closing(route.dispatcher.close());
          route.agent.destroy();
          previous.routes.delete(address);
        }
      return false;
    }
    this.clear(trust.scopeId);
    this.#policies.set(trust.scopeId, { trust, routes: new Map() });
    return true;
  }
  clear(scopeId: string): void {
    const policy = this.#policies.get(scopeId);
    if (policy !== undefined)
      for (const route of policy.routes.values()) {
        closing(route.dispatcher.destroy(new HubTransportError('Hub trust withdrawn')));
        route.agent.destroy();
      }
    this.#policies.delete(scopeId);
  }
  close(): void {
    for (const scope of [...this.#policies.keys()]) this.clear(scope);
  }
  lease(scopeId: string, input: string): HubLease {
    const policy = this.#policies.get(scopeId);
    if (policy === undefined) throw new HubTransportError('Hub scope has no enrolled trust');
    const url = new URL(input);
    const endpoint = policy.trust.endpoints.find(
      (entry) => new URL(entry.url).origin === url.origin,
    );
    if (endpoint === undefined) throw new HubTransportError('Hub endpoint has no enrolled trust');
    return endpoint.kind === 'lan' ? this.#lanLease(policy, url) : { url };
  }
  #lanLease(policy: Policy, original: URL): HubLease {
    const hostname = original.hostname.replace(/^\[|\]$/g, '');
    const address = isIP(hostname) > 0 ? hostname : policy.trust.lanAddresses[0];
    if (address === undefined || !policy.trust.lanAddresses.includes(address))
      throw new HubTransportError('LAN endpoint has no scoped address');
    let route = policy.routes.get(address);
    if (route === undefined) {
      route = pinnedRoute(policy.trust, address);
      policy.routes.set(address, route);
    }
    const url = new URL(original);
    url.hostname = policy.trust.identity.tls.serverName;
    return { url, dispatcher: route.dispatcher, agent: route.agent };
  }
}
