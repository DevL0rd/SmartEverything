import WebSocket, { type ClientOptions } from 'ws';
import type { ComputerAiRuntime } from '@smarteverything/domain';
import type { NodeRouteAuthority, NodeRouteState } from './route-authority';
import { streamHubFetch } from './stream-fetch';

const locallyRetiredSockets = new WeakSet<WebSocket>();

export function retireNodeHubSocket(socket: WebSocket): void {
  locallyRetiredSockets.add(socket);
  socket.terminate();
}

export interface NodeMcpTransport {
  endpoint(runtime: ComputerAiRuntime, url: string, token: string): string;
  revoke(runtime: ComputerAiRuntime): void;
}

export interface NodeHubTransport {
  readonly mcp?: NodeMcpTransport;
  readonly fetch: typeof fetch;
  readonly socket: (url: URL, protocols: string | string[], options: ClientOptions) => WebSocket;
  readonly subscribe: (listener: (state: NodeRouteState) => void) => () => void;
  readonly ready: () => boolean;
}
export function nodeHubTransport(
  authority: NodeRouteAuthority,
  canonical: string,
  mcp?: NodeMcpTransport,
): NodeHubTransport {
  return {
    ...(mcp === undefined ? {} : { mcp }),
    fetch: routedNodeFetch(authority, new URL(canonical).origin),
    socket: (input, protocols, options): WebSocket =>
      routedNodeSocket(authority, input, protocols, options),
    subscribe: (listener) => authority.subscribe(listener),
    ready: (): boolean => authority.state.endpoint !== null,
  };
}

function routedNodeFetch(authority: NodeRouteAuthority, canonicalOrigin: string): typeof fetch {
  return async (input, init): Promise<Response> => {
    const target = fetchTarget(input);
    if (new URL(target).origin !== canonicalOrigin) return fetch(input, init);
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!authority.ownsCredential(headers.get('authorization'))) return fetch(input, init);
    const request = new Request(input, init);
    const lease = authority.lease(request.url);
    return streamHubFetch(request, {
      ...lease,
      signal: AbortSignal.any([lease.signal, request.signal]),
      failed: (): void => {
        authority.failed(lease.generation);
      },
    });
  };
}
function routedNodeSocket(
  authority: NodeRouteAuthority,
  input: URL,
  protocols: string | string[],
  options: ClientOptions,
): WebSocket {
  const canonicalUrl = new URL(input);
  canonicalUrl.protocol = canonicalUrl.protocol === 'wss:' ? 'https:' : 'http:';
  for (const [name, value] of Object.entries(options.headers ?? {}))
    if (name.toLowerCase() === 'authorization' && !authority.ownsCredential(value))
      return new WebSocket(input, protocols, {
        ...options,
        rejectUnauthorized: true,
        followRedirects: false,
      });
  const lease = authority.lease(canonicalUrl.href);
  const url = new URL(lease.url);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url, protocols, {
    ...options,
    ...(lease.agent === undefined ? {} : { agent: lease.agent }),
    rejectUnauthorized: true,
    followRedirects: false,
  });
  const retire = (): void => {
    retireNodeHubSocket(socket);
  };
  lease.signal.addEventListener('abort', retire, { once: true });
  socket.once('close', (code) => {
    lease.signal.removeEventListener('abort', retire);
    if (code === 1006 && !lease.signal.aborted && !locallyRetiredSockets.has(socket))
      authority.failed(lease.generation);
  });
  socket.once('error', () => {
    if (!lease.signal.aborted && !locallyRetiredSockets.has(socket))
      authority.failed(lease.generation);
  });
  if (lease.signal.aborted) retire();
  return socket;
}

export function openNodeHubSocket(
  transport: NodeHubTransport | undefined,
  url: URL,
  protocols: string | string[],
  options: ClientOptions,
): WebSocket {
  return transport === undefined
    ? new WebSocket(url, protocols, options)
    : transport.socket(url, protocols, options);
}

function fetchTarget(input: Parameters<typeof fetch>[0]): string {
  if (input instanceof Request) return input.url;
  return input instanceof URL ? input.href : input;
}
