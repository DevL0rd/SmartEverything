import { createHash, timingSafeEqual } from 'node:crypto';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import { COMPUTER_MCP_TOKEN, type ComputerAiRuntime } from '@smarteverything/domain';
import type { HubFetchLease } from './stream-fetch';
import { HubRefusalError, HubTransportError } from './policy';
import { guestRequestTarget } from './guest-contract';
import { relayGuestRequest } from './guest-http';
import { LoopbackListener, type LoopbackEntry } from './loopback-listener';
import type { McpGrantAddress } from './node-transport';

export interface GuestLeaseAuthority {
  lease(url: string): HubFetchLease & { readonly generation: number };
  failed(generation: number): void;
  readonly view: {
    readonly trust: {
      readonly identity: { readonly id: string };
      readonly endpoints: readonly { readonly url: string }[];
    } | null;
  };
}
export interface BrokerGrantCredentials {
  readonly url: string;
  readonly token: string;
  readonly secret?: string;
}
export interface BrokerExchange {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly prefix: string;
  readonly grant: BrokerGrantCredentials;
  readonly signal: AbortSignal;
  readonly host: string;
  readonly authority: GuestLeaseAuthority;
}
export interface BrokerFamily {
  readonly kind: string;
  serve(exchange: BrokerExchange): Promise<void>;
}
export interface BrokerGrantRequest extends BrokerGrantCredentials {
  readonly kind: string;
  readonly owner: string;
}
interface BrokerGrant {
  readonly family: BrokerFamily;
  readonly credentials: BrokerGrantCredentials;
}

const FAMILY_KIND = /^[a-z]+$/;
const MCP_KIND = 'guest';

const mcpFamily: BrokerFamily = {
  kind: MCP_KIND,
  async serve({ request, response, prefix, grant, signal, host, authority }): Promise<void> {
    const target = guestRequestTarget(request, { ...grant, prefix }, host);
    const lease = authority.lease(target.url);
    await relayGuestRequest(request, response, target, {
      ...lease,
      signal: AbortSignal.any([lease.signal, signal]),
      failed: (): void => {
        authority.failed(lease.generation);
      },
    });
  },
};

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
function secretAdmitted(header: string | undefined, secret: string): boolean {
  return header !== undefined && timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
function underPrefix(url: string | undefined, prefix: string): boolean {
  return (
    url !== undefined &&
    url.startsWith(prefix) &&
    (url.length === prefix.length || url[prefix.length] === '/' || url[prefix.length] === '?')
  );
}

export class HubGuestBroker {
  private readonly families = new Map<string, BrokerFamily>([[MCP_KIND, mcpFamily]]);
  private readonly listener = new LoopbackListener<string, BrokerGrant>({
    name: 'Guest broker',
    event: 'guest.refused',
    idPattern: /^\/[a-z]+\/([0-9a-f]{64})(?:[/?]|$)/,
    unknownMessage: 'Broker grant is unknown or was retired',
    retiredMessage: 'Broker grant was retired',
    serve: (request, response, id, entry): Promise<void> =>
      this.serve(request, response, id, entry),
  });
  constructor(
    readonly authority: GuestLeaseAuthority,
    readonly canonicalOrigin: string,
  ) {}
  async start(): Promise<void> {
    await this.listener.start();
  }
  register(family: BrokerFamily): void {
    if (!FAMILY_KIND.test(family.kind))
      throw new HubTransportError('Broker family kind must be lowercase letters');
    if (this.families.has(family.kind))
      throw new HubTransportError(`Broker family ${family.kind} is already registered`);
    this.families.set(family.kind, family);
  }
  grant(request: BrokerGrantRequest): string {
    const family = this.families.get(request.kind);
    if (family === undefined)
      throw new HubTransportError(`Broker family ${request.kind} is not registered`);
    if (!this.listener.running) throw new HubTransportError('Guest broker listener is unavailable');
    const { kind, owner, ...credentials } = request;
    const id = this.listener.add(owner, { family, credentials }, undefined, (retired) => {
      this.listener.release(retired);
    });
    return this.grantUrl(kind, id);
  }
  openMcp(runtime: ComputerAiRuntime, address: McpGrantAddress, credential: string): string {
    if (!this.listener.running) throw new HubTransportError('Guest broker listener is unavailable');
    const token = COMPUTER_MCP_TOKEN.parse(credential);
    const url = this.admittedMcpUrl(address);
    const owner = `mcp:${runtime}`;
    const known = this.listener.find(
      (entry) => entry.owner === owner && entry.value.credentials.token === token,
    );
    if (known !== undefined) return this.mcpUrl(known);
    this.closeOwner(owner);
    const lease = this.authority.lease(url);
    lease.signal.throwIfAborted();
    const id = this.listener.add(
      owner,
      { family: mcpFamily, credentials: { url, token } },
      lease.signal,
      (retired) => {
        this.listener.release(retired);
      },
    );
    return this.mcpUrl(id);
  }
  private admittedMcpUrl(address: McpGrantAddress): string {
    const origin = new URL(address.url).origin;
    if (address.url !== new URL('/mcp', origin).href)
      throw new HubTransportError('MCP grant URL is not a hub MCP endpoint');
    const { trust } = this.authority.view;
    if (address.pin !== null && trust?.identity.id !== address.pin)
      throw new HubTransportError('MCP grant pin differs from the enrolled hub identity');
    const enrolled =
      origin === this.canonicalOrigin ||
      trust?.endpoints.some((endpoint) => new URL(endpoint.url).origin === origin) === true;
    if (!enrolled) throw new HubTransportError('MCP grant URL is not an enrolled hub endpoint');
    return new URL('/mcp', this.canonicalOrigin).href;
  }
  private mcpUrl(id: string): string {
    return `${this.grantUrl(MCP_KIND, id)}/mcp`;
  }
  private grantUrl(kind: string, id: string): string {
    return `http://${this.listener.host}/${kind}/${id}`;
  }
  closeOwner(owner: string): void {
    this.listener.releaseWhere((entry) => entry.owner === owner);
  }
  close(): void {
    this.listener.close();
  }
  private async serve(
    request: IncomingMessage,
    response: ServerResponse,
    id: string,
    entry: LoopbackEntry<string, BrokerGrant>,
  ): Promise<void> {
    const { family, credentials } = entry.value;
    const prefix = `/${family.kind}/${id}`;
    if (!underPrefix(request.url, prefix))
      throw new HubRefusalError('Grant belongs to another broker family', 403);
    if (
      credentials.secret !== undefined &&
      !secretAdmitted(request.headers.authorization, credentials.secret)
    )
      throw new HubRefusalError('Grant secret was not presented', 403);
    const controller = new AbortController();
    const cancel = (): void => {
      controller.abort();
    };
    response.once('close', cancel);
    request.once('aborted', cancel);
    try {
      await family.serve({
        request,
        response,
        prefix,
        grant: credentials,
        signal: AbortSignal.any([controller.signal, entry.controller.signal]),
        host: this.listener.host,
        authority: this.authority,
      });
    } finally {
      controller.abort();
      response.removeListener('close', cancel);
      request.removeListener('aborted', cancel);
    }
  }
}
