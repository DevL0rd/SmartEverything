import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  COMPUTER_MCP_TOKEN,
  NATIVE_HUB_GUEST_TRANSPORT,
  type NativeHubCredentialBinding,
  type NativeHubGuestTransport,
  type ComputerAiRuntime,
} from '@smarteverything/domain';
import type { HubFetchLease } from './stream-fetch';
import { HubTransportError } from './policy';
import { guestRequestTarget } from './guest-contract';
import {
  relayGuestRequest,
  GUEST_IDLE_TIMEOUT_MS,
  GUEST_QUEUE_BYTES,
  GuestInputLimitError,
} from './guest-http';

const MAX_GUEST_GRANTS = 32;
const MAX_GUEST_STREAMS = 32;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
export interface GuestLeaseAuthority {
  lease(
    url: string,
    binding?: NativeHubCredentialBinding,
    generation?: number,
  ): HubFetchLease & { readonly generation: number };
  failed(generation: number): void;
  ownsCredential(value: unknown): boolean;
}
interface GuestGrant {
  readonly owner: string;
  readonly prefix: string;
  readonly url: string;
  readonly token: string;
  readonly mcp: boolean;
  readonly binding?: NativeHubCredentialBinding;
  readonly routeGeneration?: number;
  readonly controller: AbortController;
  readonly removeAbort: () => void;
  readonly timer?: ReturnType<typeof setTimeout>;
  readonly expiresAt?: number;
}
export class HubGuestBroker {
  private server: Server | null = null;
  private host = '';
  private active = 0;
  private readonly grants = new Map<string, GuestGrant>();
  constructor(
    readonly authority: GuestLeaseAuthority,
    readonly canonicalOrigin: string,
  ) {}
  async start(): Promise<void> {
    if (this.server !== null) throw new HubTransportError('Guest broker is already running');
    const server = createServer(
      {
        maxHeaderSize: 8192,
        highWaterMark: GUEST_QUEUE_BYTES,
        headersTimeout: 10_000,
        requestTimeout: 30_000,
        connectionsCheckingInterval: 1000,
      },
      (request, response): void => {
        void this.serve(request, response).catch((cause: unknown) => {
          if (response.headersSent) response.destroy();
          else {
            response.writeHead(cause instanceof GuestInputLimitError ? 413 : 403, {
              'cache-control': 'no-store',
              connection: 'close',
            });
            response.end();
          }
        });
      },
    );
    server.maxHeadersCount = 32;
    server.maxRequestsPerSocket = 1;
    server.maxConnections = MAX_GUEST_STREAMS;
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
    const token = COMPUTER_MCP_TOKEN.parse(credential);
    if (url !== new URL('/mcp', this.canonicalOrigin).href)
      throw new HubTransportError('MCP grant URL differs from the canonical MCP endpoint');
    const owner = `mcp:${runtime}`;
    const known = [...this.grants.values()].find(
      (grant) => grant.owner === owner && grant.token === token,
    );
    if (known !== undefined) return `http://${this.host}${known.prefix}/mcp`;
    this.closeOwner(owner);
    const grant = this.create({ owner, url, token, mcp: true });
    return `http://${this.host}${grant.prefix}/mcp`;
  }
  openGuest(
    input: Omit<NativeHubGuestTransport, 'localUrl'>,
    token: string,
  ): NativeHubGuestTransport {
    if (!this.authority.ownsCredential(`Bearer ${token}`))
      throw new HubTransportError('Guest credential is not owned by this route authority');
    const owner = `guest:${input.deviceId}:${input.generation}:${input.runtimeInstance}`;
    const url = input.binding.canonicalOrigin;
    if (url !== this.canonicalOrigin || !['client', 'node'].includes(input.binding.credentialKind))
      throw new HubTransportError(
        'Guest binding differs from the admitted hub credential kind or origin',
      );
    const parsed = NATIVE_HUB_GUEST_TRANSPORT.parse({
      ...input,
      localUrl: 'http://127.0.0.1:1/guest/' + '0'.repeat(64),
    });
    if (Date.parse(parsed.expiresAt) <= Date.now())
      throw new HubTransportError('Guest descriptor expired');
    this.closeOwner(owner);
    const grant = this.create(
      {
        owner,
        url,
        token,
        mcp: false,
        binding: parsed.binding,
        routeGeneration: parsed.routeGeneration,
      },
      parsed.expiresAt,
    );
    return { ...parsed, localUrl: `http://${this.host}${grant.prefix}` };
  }
  private create(
    input: Pick<GuestGrant, 'owner' | 'url' | 'token' | 'mcp' | 'binding' | 'routeGeneration'>,
    expiresAt?: string,
  ): GuestGrant {
    if (this.server === null || this.grants.size >= MAX_GUEST_GRANTS)
      throw new HubTransportError('Guest broker listener or grant capacity is unavailable');
    const lease = this.authority.lease(input.url, input.binding, input.routeGeneration);
    lease.signal.throwIfAborted();
    const id = randomBytes(32).toString('hex');
    const retire = (): void => {
      this.release(id);
    };
    if (!input.mcp) lease.signal.addEventListener('abort', retire, { once: true });
    const grant: GuestGrant = {
      ...input,
      prefix: `/guest/${id}`,
      controller: new AbortController(),
      removeAbort: (): void => {
        lease.signal.removeEventListener('abort', retire);
      },
    };
    this.grants.set(id, grant);
    if (expiresAt !== undefined) this.armExpiry(id, Date.parse(expiresAt));
    return grant;
  }
  private armExpiry(id: string, expiresAt: number): void {
    const grant = this.grants.get(id);
    if (grant === undefined) return;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      this.release(id);
      return;
    }
    const timer = setTimeout(
      (): void => {
        this.armExpiry(id, expiresAt);
      },
      Math.min(remaining, MAX_TIMER_DELAY_MS),
    );
    timer.unref();
    this.grants.set(id, { ...grant, timer, expiresAt });
  }
  private release(id: string): void {
    const grant = this.grants.get(id);
    if (grant === undefined) return;
    this.grants.delete(id);
    if (grant.timer !== undefined) clearTimeout(grant.timer);
    grant.removeAbort();
    grant.controller.abort(
      new HubTransportError('Guest runtime or MCP grant was retired; effects may be unknown'),
    );
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
    if (grant === undefined || this.active >= MAX_GUEST_STREAMS)
      throw new HubTransportError('Guest grant or connection capacity is unavailable');
    if (grant.expiresAt !== undefined && grant.expiresAt <= Date.now())
      throw new HubTransportError('Guest descriptor expired');
    const target = guestRequestTarget(request, grant, this.host);
    const lease = this.authority.lease(target.url, grant.binding, grant.routeGeneration);
    const controller = new AbortController();
    const signal = AbortSignal.any([lease.signal, controller.signal, grant.controller.signal]);
    const cancel = (): void => {
      controller.abort();
    };
    response.once('close', cancel);
    request.once('aborted', cancel);
    response.setTimeout(GUEST_IDLE_TIMEOUT_MS, cancel);
    this.active += 1;
    try {
      await relayGuestRequest(request, response, target, {
        ...lease,
        signal,
        failed: (): void => {
          if (!signal.aborted) this.authority.failed(lease.generation);
        },
      });
    } finally {
      this.active -= 1;
      controller.abort();
      response.removeListener('close', cancel);
      request.removeListener('aborted', cancel);
    }
  }
}
