import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import {
  NATIVE_HUB_RESOURCE_OPEN,
  nativeHubResourceIdentity,
  type NativeHubResource,
  type NativeHubResourceOpen,
} from '@smarteverything/domain';
import type { HubLeasePort } from './lease';
import { HubRefusalError, HubTransportError } from './policy';
import { refuseLoopbackRequest } from './refusal';
import { resourceRequestHeaders, resourceResponseHeaders } from './resource-contract';
import { openHubResource } from './transport';

interface ResourceGrant {
  readonly owner: number;
  readonly input: NativeHubResourceOpen;
  readonly controller: AbortController;
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
    const server = createServer((request, response) => {
      void this.serve(request, response).catch((cause: unknown) => {
        refuseLoopbackRequest(response, cause, 'resource.refused');
      });
    });
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
    const grant = existing === undefined ? undefined : this.grants.get(existing);
    if (existing !== undefined && grant !== undefined) {
      this.grants.set(existing, { ...grant, input });
      return this.presentation(existing, input);
    }
    return this.create(owner, input, identity, lease.signal);
  }
  private create(
    owner: number,
    input: NativeHubResourceOpen,
    identity: string,
    signal: AbortSignal | undefined,
  ): NativeHubResource {
    const id = randomBytes(32).toString('hex');
    const abort = (): void => {
      this.release(owner, id);
    };
    signal?.addEventListener('abort', abort, { once: true });
    this.grants.set(id, {
      owner,
      input,
      identity,
      controller: new AbortController(),
      removeAbort: (): void => {
        signal?.removeEventListener('abort', abort);
      },
    });
    this.resources.set(identity, id);
    return this.presentation(id, input);
  }
  private presentation(id: string, input: NativeHubResourceOpen): NativeHubResource {
    return { id, localUrl: `http://${this.host}/resource/${id}`, expiresAt: input.expiresAt };
  }
  admit(owner: number, id: string): ResourceAdmission {
    const grant = this.grants.get(id);
    if (grant?.owner !== owner || grant.controller.signal.aborted)
      throw new HubRefusalError(
        'Resource grant is absent, released or belongs to another owner',
        409,
      );
    return { input: grant.input, signal: grant.controller.signal };
  }
  release(owner: number, id: string): void {
    const grant = this.grants.get(id);
    if (grant === undefined) return;
    if (grant.owner !== owner)
      throw new HubRefusalError('Resource grant belongs to another owner', 403);
    this.grants.delete(id);
    this.resources.delete(grant.identity);
    grant.removeAbort();
    grant.controller.abort(new HubTransportError('Resource grant released'));
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
    const headers = resourceRequestHeaders(request);
    const id = /^\/resource\/([0-9a-f]{64})$/.exec(request.url ?? '')?.[1];
    const grant = id === undefined ? undefined : this.grants.get(id);
    if (grant === undefined || id === undefined)
      throw new HubRefusalError('Resource grant is unknown or was released', 409);
    const admission = this.admit(grant.owner, id);
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, admission.signal]);
    const cancel = (): void => {
      controller.abort();
    };
    response.once('close', cancel);
    request.once('aborted', cancel);
    try {
      const upstream = await openHubResource(this.policies, admission.input, { headers, signal });
      response.writeHead(upstream.statusCode, {
        ...resourceResponseHeaders(upstream.headers),
        'cache-control': 'no-store',
        'access-control-allow-origin': this.appOrigin,
        'access-control-expose-headers':
          'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified',
      });
      if (request.method === 'HEAD') {
        response.end();
        cancel();
        return;
      }
      await pipeline(upstream.body, response, { signal });
    } finally {
      response.removeListener('close', cancel);
      request.removeListener('aborted', cancel);
    }
  }
}
