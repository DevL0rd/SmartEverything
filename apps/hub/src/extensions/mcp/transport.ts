import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../../clock';
import { bearerOf } from '../../server/http';
import { withRequestSignal } from '../../server/request-signal';
import type { Store } from '../../store/store';
import { callerFor, challenge, type AcceptedCaller, type McpCaller } from './bearer';
import { statelessHttp } from './http-transport';
import { replyJson } from './respond';
import { createMcpServer } from './server';
import { siteOf } from './site';
import type { ToolListFeed } from './tool-list-feed';
import type { ToolContext } from './tools/registry';

const UNAUTHORIZED = -32001;

export interface TransportOptions {
  readonly store: Store;
  readonly clock: Clock;
  readonly tools: ToolContext;
  readonly log: Logger;
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);
const LOOPBACK_ADDRESSES: ReadonlySet<string> = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function loopback(request: IncomingMessage): boolean {
  const host = (request.headers.host ?? '').replace(/:\d+$/, '');
  return LOOPBACK_HOSTS.has(host) && LOOPBACK_ADDRESSES.has(request.socket.remoteAddress ?? '');
}

function callerOf(options: TransportOptions, request: IncomingMessage): McpCaller {
  const token = bearerOf(request);
  if (token === null) {
    return { kind: 'refused', reason: 'Connect this assistant to SmartEverything first' };
  }
  const caller = callerFor(
    { store: options.store, site: siteOf(options.store), now: options.clock.now() },
    token,
  );
  if (caller.kind === 'accepted' && caller.localOnly && !loopback(request)) {
    return { kind: 'refused', reason: 'This key works only on this computer' };
  }
  return caller;
}

function authorized(
  options: TransportOptions,
  request: IncomingMessage,
  response: ServerResponse,
): AcceptedCaller | null {
  const caller = callerOf(options, request);
  if (caller.kind === 'accepted') {
    options.log.trace('caller.accepted', {
      via: caller.via,
      method: request.method,
      localOnly: caller.localOnly,
    });
    return caller;
  }
  options.log.warn('caller.refused', {
    reason: caller.reason,
    method: request.method,
    hadBearer: bearerOf(request) !== null,
  });
  replyJson(
    response,
    401,
    { jsonrpc: '2.0', id: null, error: { code: UNAUTHORIZED, message: caller.reason } },
    {
      'www-authenticate': challenge(
        siteOf(options.store),
        bearerOf(request) === null ? null : 'invalid_token',
      ),
    },
  );
  return null;
}

export async function handleMcp(
  options: TransportOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const caller = authorized(options, request, response);
  if (caller === null) {
    return;
  }
  const mcp = createMcpServer({ ...options.tools, caller }, options.log);
  const http = statelessHttp(true);
  response.once('close', () => {
    mcp.close().catch((cause: unknown) => {
      options.log.error('request.close_failed', cause);
    });
  });
  const startedAt = performance.now();
  options.log.debug('request.started', { via: caller.via, method: request.method });
  await mcp.connect(http.transport);
  try {
    await withRequestSignal(request, response, () => http.handle(request, response));
    options.log.debug('request.finished', () => ({
      via: caller.via,
      status: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    }));
  } catch (cause) {
    options.log.error('request.failed', cause, {
      via: caller.via,
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw cause;
  }
}

export async function streamMcp(
  options: TransportOptions,
  feed: ToolListFeed,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (authorized(options, request, response) !== null) {
    await feed.attach(request, response);
  }
}
