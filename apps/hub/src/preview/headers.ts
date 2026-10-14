import { ApiError } from '@smarteverything/domain';
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import { PREVIEW_COOKIE } from './leases';
const HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'authorization',
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
]);
function excluded(name: string, tokens: readonly string[]): boolean {
  return HOP.has(name) || tokens.includes(name) || name.startsWith('x-smarteverything-');
}
function originHeader(value: string | readonly string[], from: string, to: string): string {
  if (typeof value !== 'string' || new URL(value).origin !== new URL(from).origin)
    throw new ApiError('forbidden', 'Origin-bearing request header names another service.');
  const url = new URL(value);
  return `${new URL(to).origin}${url.pathname === '/' ? '' : url.pathname}${url.search}`;
}
function requestHeader(
  name: string,
  value: string | string[],
  origins: readonly [string, string],
): string | string[] {
  if (name === 'origin' || name === 'referer') return originHeader(value, origins[0], origins[1]);
  if (name === 'cookie') {
    if (typeof value !== 'string')
      throw new ApiError('invalid_request', 'The service cookie must be one header.');
    return value
      .split(';')
      .filter((p) => !p.trim().startsWith(`${PREVIEW_COOKIE}=`))
      .join(';');
  }
  return value;
}
export function mappedHeaders(
  headers: IncomingHttpHeaders,
  from: string,
  to: string,
): OutgoingHttpHeaders {
  const tokens = (headers.connection ?? '').split(',').map((v) => v.trim().toLowerCase());
  const output: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || excluded(name, tokens)) continue;
    if (name.startsWith('sec-fetch-') || name.startsWith('sec-websocket-') || name === 'host')
      continue;
    output[name] = requestHeader(name, value, [from, to]);
  }
  output.host = new URL(to).host;
  return output;
}
function cookie(value: string): string {
  if (value.split('=', 1)[0]?.trim() === PREVIEW_COOKIE)
    throw new ApiError(
      'upstream_failed',
      'The service attempted to overwrite the reserved preview cookie.',
    );
  return value
    .split(';')
    .filter((part) => !/^\s*domain\s*=/i.test(part))
    .join(';');
}
function responseHeader(
  name: string,
  value: string | string[],
  source: string,
  preview: string,
): string | string[] {
  if (name === 'set-cookie') return typeof value === 'string' ? [cookie(value)] : value.map(cookie);
  if (name !== 'location') return value;
  if (typeof value !== 'string')
    throw new ApiError('upstream_failed', 'The service returned an invalid redirect.');
  const url = new URL(value, source);
  if (url.origin !== new URL(source).origin)
    throw new ApiError(
      'upstream_failed',
      'The service redirected outside its exact published origin.',
    );
  return `${preview}${url.pathname}${url.search}${url.hash}`;
}
export function responseHeaders(
  headers: IncomingHttpHeaders,
  source: string,
  preview: string,
  ancestors: readonly string[],
): OutgoingHttpHeaders {
  const output: OutgoingHttpHeaders = {};
  const tokens = (headers.connection ?? '').split(',').map((v) => v.trim().toLowerCase());
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || excluded(name, tokens) || name === 'alt-svc') continue;
    output[name] = responseHeader(name, value, source, preview);
  }
  const policy = `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${preview.replace('https:', 'wss:')}; form-action 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; frame-ancestors ${ancestors.join(' ')}`;
  const upstream = headers['content-security-policy'];
  output['content-security-policy'] = [
    policy,
    ...(typeof upstream === 'string' ? [upstream] : []),
  ].join(', ');
  output['referrer-policy'] = 'no-referrer';
  output['x-content-type-options'] = 'nosniff';
  output['cache-control'] = 'no-store';
  return output;
}
