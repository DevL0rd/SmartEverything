import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import {
  NATIVE_HUB_RESOURCE_OPEN,
  nativeHubResourceIdentity,
  type NativeHubResource,
  type NativeHubResourceOpen,
} from '@smarteverything/domain';
import type { HubLeasePort } from './lease';
import { HubRefusalError, HubTransportError } from './policy';
import { LoopbackListener, type LoopbackEntry } from './loopback-listener';
import { resourceRequestHeaders, resourceResponseHeaders } from './resource-contract';
import { openHubResource } from './transport';

interface ResourceGrant {
  readonly input: NativeHubResourceOpen;
  readonly identity: string;
}
export interface ResourceAdmission {
  readonly input: NativeHubResourceOpen;
  readonly signal: AbortSignal;
}
export class HubResourceBroker {
  private readonly resources = new Map<string, string>();
  private readonly listener = new LoopbackListener<number, ResourceGrant>({
    name: 'Resource listener',
    event: 'resource.refused',
    idPattern: /^\/resource\/([0-9a-f]{64})$/,
    unknownMessage: 'Resource grant is unknown or was released',
    retiredMessage: 'Resource grant released',
    serve: (request, response, id, entry): Promise<void> =>
      this.serve(request, response, id, entry),
  });
  constructor(
    readonly policies: HubLeasePort,
    readonly appOrigin: string,
  ) {}
  get origin(): string | undefined {
    return this.listener.origin;
  }
  async start(): Promise<void> {
    await this.listener.start();
  }
  open(owner: number, value: unknown): NativeHubResource {
    const input = NATIVE_HUB_RESOURCE_OPEN.parse(value);
    if (!this.listener.running) throw new HubTransportError('Resource listener is unavailable');
    const lease = this.policies.lease(
      input.scopeId,
      input.url,
      input.binding,
      input.routeGeneration,
    );
    if (lease.signal?.aborted === true) throw new HubTransportError('Resource scope was withdrawn');
    const identity = JSON.stringify([owner, nativeHubResourceIdentity(input)]);
    const existing = this.resources.get(identity);
    const grant = existing === undefined ? undefined : this.listener.get(existing);
    if (existing !== undefined && grant !== undefined) {
      this.listener.replace(existing, { identity, input });
      return this.presentation(existing, input);
    }
    const id = this.listener.add(owner, { identity, input }, lease.signal, (retired) => {
      this.release(owner, retired);
    });
    this.resources.set(identity, id);
    return this.presentation(id, input);
  }
  private presentation(id: string, input: NativeHubResourceOpen): NativeHubResource {
    return {
      id,
      localUrl: `http://${this.listener.host}/resource/${id}`,
      expiresAt: input.expiresAt,
    };
  }
  admit(owner: number, id: string): ResourceAdmission {
    const entry = this.listener.get(id);
    if (entry?.owner !== owner || entry.controller.signal.aborted)
      throw new HubRefusalError(
        'Resource grant is absent, released or belongs to another owner',
        409,
      );
    return { input: entry.value.input, signal: entry.controller.signal };
  }
  release(owner: number, id: string): void {
    const entry = this.listener.get(id);
    if (entry === undefined) return;
    if (entry.owner !== owner)
      throw new HubRefusalError('Resource grant belongs to another owner', 403);
    this.resources.delete(entry.value.identity);
    this.listener.release(id);
  }
  clearScope(scopeId: string): void {
    this.releaseWhere((entry) => entry.value.input.scopeId === scopeId);
  }
  closeOwner(owner: number): void {
    this.releaseWhere((entry) => entry.owner === owner);
  }
  close(): void {
    this.releaseWhere(() => true);
    this.listener.close();
  }
  private releaseWhere(match: (entry: LoopbackEntry<number, ResourceGrant>) => boolean): void {
    this.listener.releaseWhere((entry) => {
      if (!match(entry)) return false;
      this.resources.delete(entry.value.identity);
      return true;
    });
  }
  private async serve(
    request: IncomingMessage,
    response: ServerResponse,
    id: string,
    entry: LoopbackEntry<number, ResourceGrant>,
  ): Promise<void> {
    const headers = resourceRequestHeaders(request);
    const admission = this.admit(entry.owner, id);
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
