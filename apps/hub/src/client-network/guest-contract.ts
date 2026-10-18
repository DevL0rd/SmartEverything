import type { IncomingMessage } from 'node:http';
import { HubRefusalError } from './policy';

const FORWARD_HEADERS = [
  'authorization',
  'accept',
  'content-type',
  'mcp-protocol-version',
  'mcp-session-id',
  'last-event-id',
] as const;
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
  readonly headers: Readonly<Record<string, string>>;
}
export function guestRequestTarget(
  request: IncomingMessage,
  grant: { readonly prefix: string; readonly url: string; readonly token: string },
  host: string,
): GuestRelayTarget {
  if (request.headers.host !== host)
    throw new HubRefusalError('Guest Host differs from the listener', 403);
  if (request.headers.authorization !== `Bearer ${grant.token}`)
    throw new HubRefusalError('Guest credential does not belong to the admitted principal', 403);
  const method = request.method;
  if (method === undefined || request.url !== `${grant.prefix}/mcp`)
    throw new HubRefusalError('MCP grant accepts only its exact MCP endpoint', 403);
  if (!['GET', 'POST', 'DELETE'].includes(method))
    throw new HubRefusalError('MCP grant accepts only GET, POST and DELETE', 403);
  const headers: Record<string, string> = {};
  for (const name of FORWARD_HEADERS) {
    const value = request.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }
  return { url: grant.url, method, headers };
}
export function guestResponseHeaders(
  incoming: Readonly<Record<string, string | string[] | undefined>>,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(incoming))
    if (RESPONSE_HEADERS.has(name) && value !== undefined) result[name] = value;
  return result;
}
