import type { IncomingMessage } from 'node:http';
import { NATIVE_HUB_GUEST_PATH, SUBSCRIPTION_INFERENCE_MAX_BYTES } from '@smarteverything/domain';
import { HubTransportError } from './policy';
import { BODY_LIMIT } from '../server/http';

const REQUEST_HEADERS = new Set([
  'authorization',
  'accept',
  'content-type',
  'mcp-protocol-version',
  'mcp-session-id',
  'last-event-id',
  'user-agent',
  'accept-encoding',
  'connection',
  'host',
  'content-length',
  'transfer-encoding',
  'accept-language',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-dest',
]);
const FORWARD_HEADERS = new Set([
  'authorization',
  'accept',
  'content-type',
  'mcp-protocol-version',
  'mcp-session-id',
  'last-event-id',
]);
const RESPONSE_HEADERS = new Set([
  'content-type',
  'content-length',
  'mcp-session-id',
  'mcp-protocol-version',
  'allow',
  'retry-after',
]);
export interface GuestRelayTarget {
  readonly url: string;
  readonly method: string;
  readonly limit: number;
  readonly headers: Headers;
}
export function guestRequestTarget(
  request: IncomingMessage,
  grant: {
    readonly prefix: string;
    readonly url: string;
    readonly token: string;
    readonly mcp: boolean;
  },
  host: string,
): GuestRelayTarget {
  const headers = validateHeaders(request, host);
  if (headers.get('authorization') !== `Bearer ${grant.token}`)
    throw new HubTransportError('Guest credential does not belong to the admitted principal');
  const method = request.method;
  const path = request.url;
  if (method === undefined || path === undefined)
    throw new HubTransportError('Guest request lacks an exact method or target');
  const suffix = path.slice(grant.prefix.length);
  if (!path.startsWith(grant.prefix))
    throw new HubTransportError('Guest path does not match grant');
  if (grant.mcp) return mcpTarget(grant.url, suffix, method, headers);
  if (method !== 'POST' || !NATIVE_HUB_GUEST_PATH.safeParse(suffix).success)
    throw new HubTransportError('Guest grant accepts only declared harness POST endpoints');
  return {
    url: new URL(suffix, grant.url).href,
    method,
    headers,
    limit:
      suffix === '/api/ai/harness/subscription-inference'
        ? SUBSCRIPTION_INFERENCE_MAX_BYTES
        : BODY_LIMIT,
  };
}
function validateHeaders(request: IncomingMessage, host: string): Headers {
  const seen = new Set<string>();
  const headers = new Headers();
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index]?.toLowerCase();
    const value = request.rawHeaders[index + 1];
    if (name === undefined || value === undefined || seen.has(name) || !REQUEST_HEADERS.has(name))
      throw new HubTransportError('Guest headers are duplicated, malformed or not admitted');
    seen.add(name);
    if (FORWARD_HEADERS.has(name)) headers.set(name, value);
  }
  if (request.headers.host !== host)
    throw new HubTransportError('Guest Host differs from listener');
  return headers;
}
export function guestResponseHeaders(input: Headers): Readonly<Record<string, string>> {
  const result: Record<string, string> = {
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    connection: 'close',
  };
  for (const [name, value] of input) if (RESPONSE_HEADERS.has(name)) result[name] = value;
  return result;
}

function mcpTarget(
  url: string,
  suffix: string,
  method: string,
  headers: Headers,
): GuestRelayTarget {
  if (suffix !== '/mcp' || !['GET', 'POST', 'DELETE'].includes(method))
    throw new HubTransportError('MCP grant accepts only its exact MCP endpoint');
  return { url, method, headers, limit: method === 'POST' ? 1024 * 1024 : 0 };
}
