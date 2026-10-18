import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { HubRefusalError } from './policy';

const REQUEST_HEADERS = [
  'range',
  'if-range',
  'if-none-match',
  'if-modified-since',
  'if-match',
  'if-unmodified-since',
] as const;
const RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'content-encoding',
  'accept-ranges',
  'etag',
  'last-modified',
] as const;

export function resourceRequestHeaders(request: IncomingMessage): Record<string, string> {
  if (!['GET', 'HEAD'].includes(request.method ?? ''))
    throw new HubRefusalError('Resource grants answer only GET and HEAD', 403);
  if (['document', 'iframe'].includes(request.headers['sec-fetch-dest'] ?? ''))
    throw new HubRefusalError('Resource grants cannot be navigated', 403);
  return Object.fromEntries(
    REQUEST_HEADERS.flatMap((name) => {
      const value = request.headers[name];
      return typeof value === 'string' ? [[name, value]] : [];
    }),
  );
}

export function resourceResponseHeaders(response: IncomingHttpHeaders): Record<string, string> {
  return Object.fromEntries(
    RESPONSE_HEADERS.flatMap((name) => {
      const value = response[name];
      return typeof value === 'string' ? [[name, value]] : [];
    }),
  );
}
