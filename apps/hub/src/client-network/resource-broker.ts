import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import {
  NATIVE_HUB_RESOURCE_OPEN,
  nativeHubResourceIdentity,
  type NativeHubResource,
  type NativeHubResourceOpen,
} from '@smarteverything/domain';
import type { HubLeasePort } from './lease.js';
import { HubTransportError } from './policy.js';
import {
  resourceRequestHeaders,
  resourceResponseHeaders,
  validateResource,
} from './resource-contract.js';
import {
  openResourceResponse,
  RESOURCE_HIGH_WATER_MARK,
  RESOURCE_IDLE_TIMEOUT_MS,
} from './resource-http.js';

const HISTORY_ROWS = 500;
const HISTORY_REPRESENTATIONS = 2;
const HISTORY_WINDOWS = 2;
const EXPORT_HEADROOM = 64;
const MAX_GRANTS = HISTORY_ROWS * HISTORY_REPRESENTATIONS * HISTORY_WINDOWS + EXPORT_HEADROOM;
const MAX_STREAMS = 32;
interface ResourceGrant {
  readonly owner: number;
  readonly input: NativeHubResourceOpen;
  readonly controller: AbortController;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly identity: string;
  readonly removeAbort: () => void;
}
export interface ResourceAdmission {
  readonly input: NativeHubResourceOpen;
  readonly signal: AbortSignal;
}
export class HubResourceBroker {
  private server: Server | null = null;
  private host = '';
  private active = 0;
  private readonly resources = new Map<string, string>();
  private readonly grants = new Map<string, ResourceGrant>();
  constructor(
    readonly policies: HubLeasePort,
    readonly appOrigin: string,
  ) {}
  get origin(): string | undefined {
    return this.host === '' ? undefined : `http://${this.host}`;
  }
  async start(): Promise<void> {
    if (this.server !== null) throw new HubTransportError('Resource listener already started');
    const server = createServer(
      {
        maxHeaderSize: 8192,
        highWaterMark: RESOURCE_HIGH_WATER_MARK,
        headersTimeout: 10_000,
        requestTimeout: 15_000,
        connectionsCheckingInterval: 1000,
      },
      (request, response) => {
        void this.serve(request, response).catch(() => {
          if (response.headersSent) response.destroy();
          else {
            response.writeHead(403, { 'cache-control': 'no-store', connection: 'close' });
            response.end();
          }
        });
      },
    );
    server.maxHeadersCount = 32;
    server.maxRequestsPerSocket = 1;
    server.maxConnections = MAX_STREAMS;
    server.on('connect', (_request, socket) => {
      socket.destroy();
    });
    server.on('upgrade', (_request, socket) => {
      socket.destroy();
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      server.close();
      throw new HubTransportError('Resource listener has no TCP address');
    }
    this.host = `127.0.0.1:${String(address.port)}`;
    this.server = server;
  }
  open(owner: number, value: unknown): NativeHubResource {
    const input = NATIVE_HUB_RESOURCE_OPEN.parse(value);
    validateResource(input);
    if (this.server === null) throw new HubTransportError('Resource listener is unavailable');
    const lease = this.policies.lease(
      input.scopeId,
      input.url,
      input.binding,
      input.routeGeneration,
    );
    if (lease.signal?.aborted === true) throw new HubTransportError('Resource scope was withdrawn');
    const identity = JSON.stringify([owner, nativeHubResourceIdentity(input)]);
    const existing = this.resources.get(identity);
    if (existing !== undefined) {
      const grant = this.grants.get(existing);
      if (grant === undefined) throw new HubTransportError('Resource grant index is inconsistent');
      if (Date.parse(grant.input.expiresAt) > Date.now()) return this.renew(existing, grant, input);
      this.release(owner, existing);
    }
    return this.create(owner, input, identity, lease.signal);
  }
  private create(
    owner: number,
    input: NativeHubResourceOpen,
    identity: string,
    signal: AbortSignal | undefined,
  ): NativeHubResource {
    if (this.grants.size >= MAX_GRANTS)
      throw new HubTransportError('Resource grant capacity is full');
    const id = randomBytes(32).toString('hex');
    const abort = (): void => {
      this.release(owner, id);
    };
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, Date.parse(input.expiresAt) - Date.now());
    timer.unref();
    this.grants.set(id, {
      owner,
      input,
      identity,
      controller: new AbortController(),
      timer,
      removeAbort: (): void => {
        signal?.removeEventListener('abort', abort);
      },
    });
    this.resources.set(identity, id);
    return this.presentation(id, input);
  }
  private renew(id: string, grant: ResourceGrant, input: NativeHubResourceOpen): NativeHubResource {
    if (Date.parse(input.expiresAt) < Date.parse(grant.input.expiresAt))
      return this.presentation(id, grant.input);
    clearTimeout(grant.timer);
    const timer = setTimeout(
      () => {
        this.release(grant.owner, id);
      },
      Date.parse(input.expiresAt) - Date.now(),
    );
    timer.unref();
    this.grants.set(id, { ...grant, input, timer });
    return this.presentation(id, input);
  }
  private presentation(id: string, input: NativeHubResourceOpen): NativeHubResource {
    return { id, localUrl: `http://${this.host}/resource/${id}`, expiresAt: input.expiresAt };
  }
  admit(owner: number, id: string): ResourceAdmission {
    const grant = this.grants.get(id);
    if (
      grant?.owner !== owner ||
      grant.controller.signal.aborted ||
      Date.parse(grant.input.expiresAt) <= Date.now()
    )
      throw new HubTransportError(
        'Resource grant is absent, withdrawn or belongs to another owner',
      );
    this.policies.lease(
      grant.input.scopeId,
      grant.input.url,
      grant.input.binding,
      grant.input.routeGeneration,
    );
    return { input: grant.input, signal: grant.controller.signal };
  }
  release(owner: number, id: string): void {
    const grant = this.grants.get(id);
    if (grant === undefined) return;
    if (grant.owner !== owner)
      throw new HubTransportError('Resource grant belongs to another owner');
    this.grants.delete(id);
    this.resources.delete(grant.identity);
    clearTimeout(grant.timer);
    grant.removeAbort();
    grant.controller.abort(new HubTransportError('Resource grant retired'));
  }
  clearScope(scopeId: string): void {
    for (const [id, grant] of this.grants)
      if (grant.input.scopeId === scopeId) this.release(grant.owner, id);
  }
  closeOwner(owner: number): void {
    for (const [id, grant] of this.grants) if (grant.owner === owner) this.release(owner, id);
  }
  close(): void {
    for (const [id, grant] of this.grants) this.release(grant.owner, id);
    this.server?.closeAllConnections();
    this.server?.close();
    this.server = null;
    this.host = '';
  }
  private async serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const headers = resourceRequestHeaders(request, this.host, this.appOrigin);
    const match = /^\/resource\/([0-9a-f]{64})$/.exec(request.url ?? '');
    const id = match?.[1];
    const grant = id === undefined ? undefined : this.grants.get(id);
    if (grant === undefined || id === undefined || this.active >= MAX_STREAMS)
      throw new HubTransportError('Resource grant or stream capacity is unavailable');
    const admission = this.admit(grant.owner, id);
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, admission.signal]);
    const cancel = (): void => {
      controller.abort();
    };
    response.once('close', cancel);
    request.once('aborted', cancel);
    response.setTimeout(RESOURCE_IDLE_TIMEOUT_MS, cancel);
    this.active += 1;
    try {
      const upstream = await openResourceResponse(this.policies, admission.input, {
        method: 'GET',
        headers,
        signal,
      });
      const status = upstream.statusCode;
      if (status === undefined) {
        upstream.destroy();
        throw new HubTransportError('Resource upstream has no status');
      }
      response.writeHead(status, {
        ...resourceResponseHeaders(upstream),
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'access-control-allow-origin': this.appOrigin,
        'access-control-expose-headers':
          'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified',
        connection: 'close',
      });
      if (request.method === 'HEAD') {
        response.end();
        cancel();
        return;
      }
      await pipeline(upstream, response, { signal });
    } finally {
      this.active -= 1;
      response.removeListener('close', cancel);
      request.removeListener('aborted', cancel);
    }
  }
}
