import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { COMPUTER_MCP_TOKEN, type ComputerAiRuntime } from '@smarteverything/domain';
import type { HubFetchLease } from './stream-fetch';
import { HubRefusalError, HubTransportError } from './policy';
import { guestRequestTarget } from './guest-contract';
import { relayGuestRequest } from './guest-http';
import { refuseLoopbackRequest } from './refusal';

export interface GuestLeaseAuthority {
  lease(url: string): HubFetchLease & { readonly generation: number };
  failed(generation: number): void;
}
interface GuestGrant {
  readonly owner: string;
  readonly prefix: string;
  readonly url: string;
  readonly token: string;
  readonly controller: AbortController;
  readonly removeAbort: () => void;
}
export class HubGuestBroker {
  private server: Server | null = null;
  private host = '';
  private readonly grants = new Map<string, GuestGrant>();
  constructor(
    readonly authority: GuestLeaseAuthority,
    readonly canonicalOrigin: string,
  ) {}
  async start(): Promise<void> {
    if (this.server !== null) throw new HubTransportError('Guest broker is already running');
    const server = createServer((request, response): void => {
      void this.serve(request, response).catch((cause: unknown) => {
        refuseLoopbackRequest(response, cause, 'guest.refused');
      });
    });
    server.on('connect', (_request, socket): void => {
      socket.destroy();
    });
    server.on('upgrade', (_request, socket): void => {
      socket.destroy();
    });
    await new Promise<void>((resolve, reject): void => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', (): void => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      server.close();
      throw new HubTransportError('Guest broker has no loopback TCP address');
    }
    this.host = `127.0.0.1:${String(address.port)}`;
    this.server = server;
  }
  openMcp(runtime: ComputerAiRuntime, url: string, credential: string): string {
    if (this.server === null) throw new HubTransportError('Guest broker listener is unavailable');
    const token = COMPUTER_MCP_TOKEN.parse(credential);
    if (url !== new URL('/mcp', this.canonicalOrigin).href)
      throw new HubTransportError('MCP grant URL differs from the canonical MCP endpoint');
    const owner = `mcp:${runtime}`;
    const known = [...this.grants.values()].find(
      (grant) => grant.owner === owner && grant.token === token,
    );
    if (known !== undefined) return `http://${this.host}${known.prefix}/mcp`;
    this.closeOwner(owner);
    const grant = this.create(owner, url, token);
    return `http://${this.host}${grant.prefix}/mcp`;
  }
  private create(owner: string, url: string, token: string): GuestGrant {
    const lease = this.authority.lease(url);
    lease.signal.throwIfAborted();
    const id = randomBytes(32).toString('hex');
    const retire = (): void => {
      this.release(id);
    };
    lease.signal.addEventListener('abort', retire, { once: true });
    const grant: GuestGrant = {
      owner,
      url,
      token,
      prefix: `/guest/${id}`,
      controller: new AbortController(),
      removeAbort: (): void => {
        lease.signal.removeEventListener('abort', retire);
      },
    };
    this.grants.set(id, grant);
    return grant;
  }
  private release(id: string): void {
    const grant = this.grants.get(id);
    if (grant === undefined) return;
    this.grants.delete(id);
    grant.removeAbort();
    grant.controller.abort(new HubTransportError('MCP grant was retired'));
  }
  closeOwner(owner: string): void {
    for (const [id, grant] of this.grants) if (grant.owner === owner) this.release(id);
  }
  close(): void {
    for (const id of this.grants.keys()) this.release(id);
    this.server?.closeAllConnections();
    this.server?.close();
    this.server = null;
    this.host = '';
  }
  private async serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const id = /^\/guest\/([0-9a-f]{64})\//.exec(request.url ?? '')?.[1];
    const grant = id === undefined ? undefined : this.grants.get(id);
    if (grant === undefined) throw new HubRefusalError('MCP grant is unknown or was retired', 409);
    const target = guestRequestTarget(request, grant, this.host);
    const lease = this.authority.lease(target.url);
    const controller = new AbortController();
    const cancel = (): void => {
      controller.abort();
    };
    response.once('close', cancel);
    request.once('aborted', cancel);
    try {
      await relayGuestRequest(request, response, target, {
        ...lease,
        signal: AbortSignal.any([lease.signal, controller.signal, grant.controller.signal]),
        failed: (): void => {
          this.authority.failed(lease.generation);
        },
      });
    } finally {
      controller.abort();
      response.removeListener('close', cancel);
      request.removeListener('aborted', cancel);
    }
  }
}
