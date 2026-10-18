import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import { PREVIEW_COOKIE } from './leases';

const ASSET_SOURCES = "'self' http: https: ws: wss: data: blob:";

export function frameAncestors(ancestors: readonly string[]): string {
  return `frame-ancestors ${ancestors.join(' ')}`;
}

export function previewCsp(ancestors: readonly string[]): string {
  return [
    `default-src ${ASSET_SOURCES} 'unsafe-inline' 'unsafe-eval'`,
    `connect-src ${ASSET_SOURCES}`,
    "object-src 'none'",
    "base-uri 'self'",
    frameAncestors(ancestors),
  ].join('; ');
}

export function pageHeaders(ancestors: readonly string[]): OutgoingHttpHeaders {
  return {
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy': previewCsp(ancestors),
  };
}

export function sourceRequestHeaders(
  headers: IncomingHttpHeaders,
  origins: { readonly preview: string; readonly source: string },
): Record<string, string> {
  const output: Record<string, string> = {};
  if (headers.origin !== undefined) output['origin'] = origins.source;
  const { referer, cookie } = headers;
  if (referer?.startsWith(origins.preview) === true)
    output['referer'] = `${origins.source}${referer.slice(origins.preview.length)}`;
  if (cookie !== undefined)
    output['cookie'] = cookie
      .split(';')
      .filter((part) => !part.trim().startsWith(`${PREVIEW_COOKIE}=`))
      .join(';');
  return output;
}
