import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../../clock';
import { withRequestSignal } from '../../server/request-signal';
import { bearerOf, readBody } from '../../server/http';
import type { Store } from '../../store/store';
import { callerFor, challenge, type AcceptedCaller, type McpCaller } from './bearer';
import { answered } from './dispatch';
import { acceptsEventStream } from './event-stream';
import {
  INCOMING,
  JSON_RPC_ERRORS,
  PROTOCOL_VERSIONS,
  errorMessage,
  isRequest,
  isSupportedVersion,
  type Incoming,
} from './protocol';
import { replyEmpty, replyJson } from './respond';
import { siteOf } from './site';
import type { ToolListFeed } from './tool-list-feed';
import type { ToolContext } from './tools/registry';

const MESSAGE_LIMIT = 1024 * 1024;

export interface TransportOptions {
  readonly store: Store;
  readonly clock: Clock;
  readonly tools: ToolContext;
  readonly log: Logger;
}

function refuse(response: ServerResponse, status: number, code: number, message: string): void {
  replyJson(response, status, errorMessage(null, code, message));
}

async function incoming(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<Incoming | null> {
  const raw = await readBody(request, MESSAGE_LIMIT);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (cause) {
    refuse(response, 400, JSON_RPC_ERRORS.parse, `The body is not JSON: ${String(cause)}`);
    return null;
  }
  const message = INCOMING.safeParse(parsed);
  if (!message.success) {
    refuse(response, 400, JSON_RPC_ERRORS.invalidRequest, 'Expected one JSON-RPC 2.0 message');
    return null;
  }
  return message.data;
}

function versionHeader(request: IncomingMessage): string | undefined {
  const header = request.headers['mcp-protocol-version'];
  return Array.isArray(header) ? header.join(',') : header;
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
  const site = siteOf(options.store);
  const token = bearerOf(request);
  const caller = callerOf(options, request);
  if (caller.kind === 'accepted') {
    return caller;
  }
  options.log.warn('caller.refused', { reason: caller.reason });
  replyJson(response, 401, errorMessage(null, JSON_RPC_ERRORS.unauthorized, caller.reason), {
    'www-authenticate': challenge(site, token === null ? null : 'invalid_token'),
  });
  return null;
}

function accepted(
  options: TransportOptions,
  request: IncomingMessage,
  response: ServerResponse,
): AcceptedCaller | null {
  const caller = authorized(options, request, response);
  if (caller === null) {
    return null;
  }
  const version = versionHeader(request);
  if (!isSupportedVersion(version)) {
    refuse(
      response,
      400,
      JSON_RPC_ERRORS.invalidRequest,
      `Unsupported MCP-Protocol-Version ${String(version)}; supported: ${PROTOCOL_VERSIONS.join(', ')}`,
    );
    return null;
  }
  return caller;
}

export async function postMcp(
  options: TransportOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const caller = accepted(options, request, response);
  if (caller === null) {
    return;
  }
  const message = await incoming(request, response);
  if (message === null) {
    return;
  }
  if (!isRequest(message)) {
    replyEmpty(response, 202);
    return;
  }
  options.log.info('request.accepted', { method: message.method });
  const reply = await withRequestSignal(request, response, () =>
    answered(message, { ...options.tools, caller }, options.log),
  );
  replyJson(response, 200, reply);
}

export function streamMcp(
  options: TransportOptions,
  feed: ToolListFeed,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!acceptsEventStream(request)) {
    refuse(
      response,
      406,
      JSON_RPC_ERRORS.invalidRequest,
      'GET opens the notification stream; send Accept: text/event-stream',
    );
    return Promise.resolve();
  }
  if (accepted(options, request, response) !== null) {
    feed.attach(response);
  }
  return Promise.resolve();
}

export function refuseMcpDelete(response: ServerResponse): Promise<void> {
  replyJson(
    response,
    405,
    errorMessage(
      null,
      JSON_RPC_ERRORS.invalidRequest,
      'This server keeps no sessions, so there is none to end',
    ),
    { allow: 'GET, POST' },
  );
  return Promise.resolve();
}
